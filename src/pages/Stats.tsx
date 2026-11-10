import { Glyph } from '@/components/Glyph';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area as RArea } from 'recharts';
import { subDays, startOfWeek, addDays } from 'date-fns';
import { db } from '@/db/db';
import { dateKey } from '@/lib/util';
import { Card, PageTitle } from '@/components/ui';

const tip = { contentStyle: { background: '#fff', border: '2px solid #2b3437', borderRadius: 0, fontFamily: 'Courier Prime' }, labelStyle: { color: '#2b3437' } };

/** Capture calendar: every day you showed up is a "snapshot" in your personal archive. */
function CaptureCalendar({ xpByDate }: { xpByDate: Map<string, number> }) {
  const end = new Date();
  const start = startOfWeek(subDays(end, 7 * 25), { weekStartsOn: 1 });
  const weeks: Date[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const shade = (xp: number) => xp === 0 ? '#ffffff' : xp < 100 ? '#dcefeb' : xp < 250 ? '#b7e2da' : xp < 450 ? '#8fcfc6' : '#2f716b';
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map(d => {
              const k = dateKey(d), xp = xpByDate.get(k) ?? 0;
              return <div key={k} title={`${k} · ${xp} XP`} className="h-3.5 w-3.5" style={{ background: d > end ? 'transparent' : shade(xp), borderRadius: xp > 0 ? '50%' : 0, boxShadow: xp > 0 ? '0 0 0 1px #2b3437' : 'inset 0 0 0 1px #2b343733' }} />;
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink/60">less {[0, 50, 150, 300, 500].map(x => <span key={x} className="inline-block h-3 w-3" style={{ background: shade(x), borderRadius: x ? '50%' : 0 }} />)} more</div>
    </div>
  );
}

export default function Stats() {
  const days = Array.from({ length: 30 }, (_, i) => dateKey(subDays(new Date(), 29 - i)));
  const since = days[0];
  const habits = useLiveQuery(() => db.habits.orderBy('order').filter(h => !h.archived).toArray(), [], []);
  const logs = useLiveQuery(() => db.habitLogs.where('date').aboveOrEqual(since).toArray(), [since], []);
  const allXp = useLiveQuery(() => db.xp.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], []);
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(since).toArray(), [since], []);

  const xpByDate = new Map<string, number>();
  allXp.forEach(e => xpByDate.set(e.date, (xpByDate.get(e.date) ?? 0) + e.xp));
  const captured = [...xpByDate.entries()].filter(([, v]) => v > 0).map(([k]) => k).sort();
  const xpByDay = days.map(d => ({ d: d.slice(5), xp: xpByDate.get(d) ?? 0 }));
  const last7 = days.slice(-7);
  const hoursByDay = last7.map(d => {
    const row: Record<string, number | string> = { d: d.slice(5) };
    areas.forEach(a => { row[a.short] = +(sessions.filter(s => s.date === d && s.areaId === a.id).reduce((s, x) => s + x.minutes, 0) / 60).toFixed(2); });
    return row;
  });
  const done = new Set(logs.filter(l => l.done).map(l => `${l.habitId}:${l.date}`));
  const fmt = (k: string) => new Date(k + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="記録" plain="stats" sub="the record, day by day">The Archive</PageTitle>

      <Card title="Snapshots of a Life" className="font-serif">
        <div className="mac-inset mb-3 flex items-center gap-2 bg-white px-3 py-2 font-sans text-sm text-black">
          <span className="font-bold">http://</span><span className="truncate">life.and.how.to.live.it/~me/today.html</span>
        </div>
        <p className="mb-3 text-base">
          Saved <b className="text-cyan">{captured.length} {captured.length === 1 ? 'time' : 'times'}</b>
          {captured.length > 0 && <> between <b className="text-xp">{fmt(captured[0])}</b> and <b className="text-xp">{fmt(captured[captured.length - 1])}</b></>}.
        </p>
        <CaptureCalendar xpByDate={xpByDate} />
      </Card>

      <Card title="The Routine · 30 days">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <tbody>{habits.map(h => (
              <tr key={h.id}><td className="whitespace-nowrap pr-2 text-ink/80"><span className="inline-flex items-center gap-1.5"><Glyph name={h.icon} size={15} />{h.name}</span></td>
                {days.map(d => <td key={d} title={d}><div className={`h-4 w-4 ${done.has(`${h.id}:${d}`) ? 'bg-mint ring-2 ring-inset ring-ink' : 'bg-white ring-1 ring-inset ring-ink/20'}`} /></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Hours by Area · 7 days">
          <div className="h-64"><ResponsiveContainer><BarChart data={hoursByDay}><XAxis dataKey="d" stroke="#615d8a" fontSize={11} /><YAxis stroke="#615d8a" fontSize={11} /><Tooltip {...tip} cursor={{ fill: '#ffffff10' }} />
            {areas.map(a => <RBar key={a.id} dataKey={a.short} stackId="h" fill={a.color} />)}</BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="XP Signal · 30 days">
          <div className="h-64"><ResponsiveContainer><AreaChart data={xpByDay}><defs><linearGradient id="gx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e3b9b2" stopOpacity={0.8} /><stop offset="1" stopColor="#a6d9d1" stopOpacity={0.2} /></linearGradient></defs>
            <XAxis dataKey="d" stroke="#615d8a" fontSize={11} interval={4} /><YAxis stroke="#615d8a" fontSize={11} /><Tooltip {...tip} /><RArea type="step" dataKey="xp" stroke="#2b3437" fill="url(#gx)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}
