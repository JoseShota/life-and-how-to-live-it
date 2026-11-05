import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area as RArea } from 'recharts';
import { subDays } from 'date-fns';
import { db } from '@/db/db';
import { dateKey } from '@/lib/util';
import { Card } from '@/components/ui';

const tip = { contentStyle: { background: '#121829', border: '1px solid #26304d', borderRadius: 12 }, labelStyle: { color: '#cbd5e1' } };

export default function Stats() {
  const days = Array.from({ length: 30 }, (_, i) => dateKey(subDays(new Date(), 29 - i)));
  const since = days[0];
  const habits = useLiveQuery(() => db.habits.orderBy('order').filter(h => !h.archived).toArray(), [], []);
  const logs = useLiveQuery(() => db.habitLogs.where('date').aboveOrEqual(since).toArray(), [since], []);
  const xp = useLiveQuery(() => db.xp.where('date').aboveOrEqual(since).toArray(), [since], []);
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], []);
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(since).toArray(), [since], []);

  const xpByDay = days.map(d => ({ d: d.slice(5), xp: xp.filter(e => e.date === d).reduce((s, e) => s + e.xp, 0) }));
  const last7 = days.slice(-7);
  const hoursByDay = last7.map(d => {
    const row: Record<string, number | string> = { d: d.slice(5) };
    areas.forEach(a => { row[a.short] = +(sessions.filter(s => s.date === d && s.areaId === a.id).reduce((s, x) => s + x.minutes, 0) / 60).toFixed(2); });
    return row;
  });
  const done = new Set(logs.filter(l => l.done).map(l => `${l.habitId}:${l.date}`));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Stats</h1>
      <Card title="Habit heatmap · 30 days">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <tbody>{habits.map(h => (
              <tr key={h.id}><td className="whitespace-nowrap pr-2 text-slate-400">{h.emoji} {h.name}</td>
                {days.map(d => <td key={d} title={d}><div className={`h-4 w-4 rounded ${done.has(`${h.id}:${d}`) ? 'bg-ok' : 'bg-slate-800'}`} /></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Focus hours by area · 7 days">
          <div className="h-64"><ResponsiveContainer><BarChart data={hoursByDay}><XAxis dataKey="d" stroke="#64748b" fontSize={11} /><YAxis stroke="#64748b" fontSize={11} /><Tooltip {...tip} />
            {areas.map(a => <RBar key={a.id} dataKey={a.short} stackId="h" fill={a.color} />)}</BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="XP per day · 30 days">
          <div className="h-64"><ResponsiveContainer><AreaChart data={xpByDay}><defs><linearGradient id="gx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity={0.6} /><stop offset="1" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="d" stroke="#64748b" fontSize={11} interval={4} /><YAxis stroke="#64748b" fontSize={11} /><Tooltip {...tip} /><RArea dataKey="xp" stroke="#8b5cf6" fill="url(#gx)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}
