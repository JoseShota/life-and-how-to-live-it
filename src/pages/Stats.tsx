import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area as RArea } from 'recharts';
import { subDays, startOfWeek, addDays } from 'date-fns';
import { db } from '@/db/db';
import { dateKey } from '@/lib/util';
import { Card, PageTitle } from '@/components/ui';

const tip = { contentStyle: { background: '#1d1036', border: '2px solid #8e6bd1', borderRadius: 0, fontFamily: 'IBM Plex Mono' }, labelStyle: { color: '#01cdfe' } };

/** Capture calendar: every day you showed up is a "snapshot" in your personal archive. */
function CaptureCalendar({ xpByDate }: { xpByDate: Map<string, number> }) {
  const end = new Date();
  const start = startOfWeek(subDays(end, 7 * 25), { weekStartsOn: 1 });
  const weeks: Date[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const shade = (xp: number) => xp === 0 ? '#2a1850' : xp < 100 ? '#5a2f8a' : xp < 250 ? '#b967ff' : xp < 450 ? '#ff71ce' : '#fffb96';
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map(d => {
              const k = dateKey(d), xp = xpByDate.get(k) ?? 0;
              return <div key={k} title={`${k} · ${xp} XP`} className="h-3.5 w-3.5" style={{ background: d > end ? 'transparent' : shade(xp), borderRadius: xp > 0 ? '50%' : 0, boxShadow: xp >= 450 ? '0 0 6px #fffb96' : undefined }} />;
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">less {[0, 50, 150, 300, 500].map(x => <span key={x} className="inline-block h-3 w-3" style={{ background: shade(x), borderRadius: x ? '50%' : 0 }} />)} more</div>
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
      <PageTitle sub="WAYBACK.DAT · the personal archive of every day you showed up">Life Archive</PageTitle>

      <Card title="⌛ SNAPSHOTS.IDX" className="font-serif">
        <div className="bevel-in mb-3 flex items-center gap-2 bg-white px-3 py-2 font-sans text-sm text-black">
          <span className="font-bold">http://</span><span className="truncate">life.and.how.to.live.it/~me/today.html</span>
        </div>
        <p className="mb-3 text-base">
          Saved <b className="text-cyan">{captured.length} {captured.length === 1 ? 'time' : 'times'}</b>
          {captured.length > 0 && <> between <b className="text-xp">{fmt(captured[0])}</b> and <b className="text-xp">{fmt(captured[captured.length - 1])}</b></>}.
        </p>
        <CaptureCalendar xpByDate={xpByDate} />
      </Card>

      <Card title="▦ HABITS.DAT — 30 days">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <tbody>{habits.map(h => (
              <tr key={h.id}><td className="whitespace-nowrap pr-2 text-slate-300">{h.emoji} {h.name}</td>
                {days.map(d => <td key={d} title={d}><div className={`h-4 w-4 ${done.has(`${h.id}:${d}`) ? 'bg-ok shadow-[0_0_6px_#05ffa1]' : 'bg-panel2'}`} /></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="▥ FOCUS_HOURS.CSV — 7 days">
          <div className="h-64"><ResponsiveContainer><BarChart data={hoursByDay}><XAxis dataKey="d" stroke="#b967ff" fontSize={11} /><YAxis stroke="#b967ff" fontSize={11} /><Tooltip {...tip} cursor={{ fill: '#ffffff10' }} />
            {areas.map(a => <RBar key={a.id} dataKey={a.short} stackId="h" fill={a.color} />)}</BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="∿ XP_SIGNAL.WAV — 30 days">
          <div className="h-64"><ResponsiveContainer><AreaChart data={xpByDay}><defs><linearGradient id="gx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff71ce" stopOpacity={0.7} /><stop offset="1" stopColor="#01cdfe" stopOpacity={0.05} /></linearGradient></defs>
            <XAxis dataKey="d" stroke="#b967ff" fontSize={11} interval={4} /><YAxis stroke="#b967ff" fontSize={11} /><Tooltip {...tip} /><RArea type="step" dataKey="xp" stroke="#ff71ce" fill="url(#gx)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}
