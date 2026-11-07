import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Glyph } from '@/components/Glyph';
import { db, setSetting } from '@/db/db';
import type { Task } from '@/db/types';
import { deleteReview, saveReview, weekStats } from '@/game/engine';
import { REVIEW_QUESTS, REVIEW_WINS, REVIEW_XP, WEEKLY_CONVERSATIONS, WEEKLY_SCORECARD, coinsFor, reviewComplete, reviewWeekFor } from '@/game/rules';
import { hoursByArea, pipelineCounts, weekDays, weekGrades } from '@/game/review';
import { loadWealthSnapshot, wealthLevelReached } from '@/game/achievements';
import { WEALTH_LEVELS } from '@/finance/wealth';
import { periodTotals, statementStatus } from '@/finance/finance';
import { exportAll, download } from '@/lib/backup';
import { useRealRates } from '@/components/RealRate';
import { extraHoursByArea } from '@/finance/finance';
import { useToday } from '@/lib/hooks';
import { cx, dateKey, mxn, parseKey } from '@/lib/util';
import { Bar, Button, Card, Empty, Input, Label, PageTitle, Select, Textarea } from '@/components/ui';

const GOOD_RATE_TARGET = 0.6; // PRD success metric: Good-or-Perfect days ≥ 60 %
const shift = (key: string, days: number) => { const d = parseKey(key); d.setDate(d.getDate() + days); return dateKey(d); };
const short = (key: string) => parseKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();

/** One quest slot for next week: an open quest, or a new one typed here. */
interface Slot { taskId: string; title: string; areaId: string }
const emptySlot = (): Slot => ({ taskId: '', title: '', areaId: '' });

export default function Review() {
  const today = useToday();
  const current = reviewWeekFor(today);
  const [monday, setMonday] = useState(current);
  useEffect(() => setMonday(current), [current]);
  const days = weekDays(monday);
  const sunday = days[6];

  const data = useLiveQuery(async () => {
    const [areas, sessions, txs, xp, events, accounts, statements] = await Promise.all([
      db.areas.orderBy('order').toArray(),
      db.sessions.where('date').between(monday, sunday, true, true).toArray(),
      db.transactions.toArray(),
      db.xp.where('date').between(monday, sunday, true, true).toArray(),
      db.pipelineEvents.where('date').between(monday, sunday, true, true).toArray(),
      db.accounts.toArray(),
      db.statements.where('dueDate').between(monday, sunday, true, true).toArray()
    ]);
    return {
      areas, sessions, txs, xp, events, accounts, statements,
      score: await weekStats(monday),
      snap: await loadWealthSnapshot(),
      reached: await wealthLevelReached(),
      levelsThisWeek: xp.filter(e => e.source === 'milestone').map(e => e.label),
      review: await db.reviews.get(monday),
      paid: (await db.xp.where('refId').equals(`review:${monday}`).count()) > 0,
      lastBackup: (await db.settings.get('lastBackupAt'))?.value as number | undefined
    };
  }, [monday, sunday]);
  const openQuests = useLiveQuery(() => db.tasks.where('status').notEqual('done').toArray(), [], []);
  const real = useRealRates(monday, sunday);
  const extra = useLiveQuery(async () => extraHoursByArea(await db.areaHours.toArray(), monday, sunday), [monday, sunday]);

  if (!data) return null;
  const grades = weekGrades(days, data.xp);
  const hours = hoursByArea(data.areas, data.sessions, days, extra);
  const money = periodTotals(data.txs, monday, sunday);
  const leads = pipelineCounts(data.events, days);
  const byAcc = new Map(data.accounts.map(a => [a.id, a]));
  const stmts = data.statements.filter(s => byAcc.has(s.accountId)).map(s => ({ s, acc: byAcc.get(s.accountId)!, st: statementStatus(byAcc.get(s.accountId)!, data.txs, s, today) }));
  const next = WEALTH_LEVELS[data.reached];
  const isCurrent = monday === current;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="回顧" plain="weekly review" sub={`${short(monday)} – ${short(sunday)} · look back, then choose three`}
        right={
          <div className="flex items-center gap-1" role="group" aria-label="Week">
            <Button variant="ghost" className="!px-3" aria-label="Previous week" onClick={() => setMonday(shift(monday, -7))}><Glyph name="arrow" size={16} className="rotate-180" /></Button>
            <Button variant="ghost" className="!px-3" disabled={isCurrent} onClick={() => setMonday(current)}>This review</Button>
            <Button variant="ghost" className="!px-3" aria-label="Next week" disabled={monday >= current} onClick={() => setMonday(shift(monday, 7))}><Glyph name="arrow" size={16} /></Button>
          </div>
        }>Review</PageTitle>

      {!isCurrent && <p role="status" className="mac-inset bg-laurel/30 p-2 text-sm">A past week: you can read and edit its review, but only the current week's review pays XP.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="The Days · good or perfect">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cx('font-display text-4xl', grades.rate >= GOOD_RATE_TARGET ? 'text-ok' : 'text-gold')}>{Math.round(grades.rate * 100)}%</span>
            <span className="text-sm text-ink/70">{grades.perfect} perfect · {grades.good} good · target {Math.round(GOOD_RATE_TARGET * 100)}%</span>
          </div>
          <ol className="mt-2 grid grid-cols-7 gap-1" aria-label="Day grades">
            {grades.marks.map(m => (
              <li key={m.date} className={cx('mac-inset flex flex-col items-center py-1 text-[11px]', m.mark === 'perfect' ? 'bg-mint' : m.mark === 'good' ? 'bg-laurel' : 'bg-white')} title={`${m.date}: ${m.mark}`}>
                <span className="font-display">{parseKey(m.date).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}</span>
                <span>{m.mark === 'perfect' ? 'P' : m.mark === 'good' ? 'G' : '·'}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-ink/70">XP this week: <b className="text-xp">{grades.xp}</b> · {grades.coins} dr earned</p>
        </Card>

        <Card title="The Scorecard">
          <div className="flex items-baseline justify-between"><span className="font-display">{data.score.count}/4 targets</span><span className={cx('font-display', data.score.earned ? 'text-ok' : 'text-ink/70')}>{data.score.earned ? `earned +${WEEKLY_SCORECARD.xp} XP` : `${WEEKLY_SCORECARD.needed} needed for +${WEEKLY_SCORECARD.xp} XP`}</span></div>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {[
              ['Focus', data.score.stats.focusHours, WEEKLY_SCORECARD.focusHours, 'h', data.score.hits.focus],
              ['Exercise', data.score.stats.exerciseDays, WEEKLY_SCORECARD.exerciseDays, 'days', data.score.hits.exercise],
              ['Money check-in', data.score.stats.moneyDays, WEEKLY_SCORECARD.moneyDays, 'days', data.score.hits.money],
              ['Good or perfect days', data.score.stats.goodDays, WEEKLY_SCORECARD.goodDays, 'days', data.score.hits.good]
            ].map(([label, v, t, unit, hit]) => (
              <li key={label as string}>
                <div className="flex justify-between"><span className={cx(hit ? 'text-ok' : undefined)}>{hit ? <Glyph name="check" size={14} className="mr-1 inline" /> : null}{label}</span><span>{(v as number).toFixed(unit === 'h' ? 1 : 0)}/{t as number} {unit}</span></div>
                <Bar value={(v as number) / (t as number)} height="h-2" color={hit ? '#a6d9d1' : undefined} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Hours per area · against target">
          {hours.length === 0 ? <Empty>No hours logged this week.</Empty> : (
            <ul className="flex flex-col gap-2 text-sm">
              {hours.map(h => (
                <li key={h.area.id}>
                  <div className="flex justify-between gap-2"><span className="inline-flex items-center gap-1.5"><Glyph name={h.area.icon} size={16} />{h.area.short}{h.other > 0 && <span className="text-[11px] text-ink/55">incl. {h.other.toFixed(1)} h other</span>}</span><span className={cx(h.target > 0 && h.hours >= h.target ? 'text-ok' : undefined)}>{h.hours.toFixed(1)}{h.target ? ` / ${h.target}` : ''} h</span></div>
                  <Bar value={h.share} height="h-2" color={h.area.color} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Money · in and out">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Tile label="In" value={mxn(money.income)} tone="text-ok" />
            <Tile label="Out" value={mxn(money.expense)} />
            <Tile label="Net" value={mxn(money.net)} tone={money.net >= 0 ? 'text-ok' : 'text-hp'} />
            <Tile label="Savings rate" value={money.savingsRate === null ? '—' : `${Math.round(money.savingsRate * 100)}%`} tone={money.savingsRate === null ? 'text-ink/60' : money.savingsRate >= 0.2 ? 'text-ok' : 'text-gold'} />
            <div className="col-span-2"><Tile label="Real MXN per hour of work this week (after taxes and costs)" value={real?.average == null ? '—' : `${mxn(real.average)}/h`} tone="text-gold" /></div>
          </div>
          <p className="mt-2 text-[12px] text-ink/60">Card purchases count when made; card payments and bucket transfers don't. One week of irregular income swings a lot: read it with the month in the Treasury.</p>
        </Card>

        <Card title="Cards and the Road">
          <h3 className="font-display text-sm text-lav">Statements due this week</h3>
          {stmts.length === 0 ? <p className="text-sm text-ink/70">None were due.</p> : (
            <ul className="mb-2 text-sm">
              {stmts.map(({ s, acc, st }) => (
                <li key={s.id} className="flex min-h-[32px] items-center justify-between gap-2">
                  <span>{acc.name} · due {s.dueDate.slice(5)}</span>
                  <span className={cx('font-display', st.state === 'paid' || st.state === 'nothing-due' ? 'text-ok' : st.state === 'late' ? 'text-hp' : 'text-gold')}>
                    {st.state === 'paid' ? 'paid in full' : st.state === 'nothing-due' ? 'nothing due' : st.state === 'late' ? `late · ${mxn(st.remaining)}` : `${mxn(st.remaining)} to pay`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-2 font-display text-sm text-lav">Wealth level</h3>
          <p className="text-sm">Level {data.reached} of {WEALTH_LEVELS.length}{data.reached ? ` · ${WEALTH_LEVELS[data.reached - 1].name}` : ''}{data.levelsThisWeek.length ? <b className="text-ok"> · reached this week</b> : null}</p>
          {next && (
            <ul className="mt-1 flex flex-col gap-1.5 text-sm">
              {data.snap.requirements[next.n].map(r => (
                <li key={r.label}>
                  <div className="flex items-start gap-2"><Glyph name={r.met ? 'check' : 'dot'} size={14} className={cx('mt-0.5 shrink-0', r.met ? 'text-ok' : 'text-ink/50')} /><span className="flex-1">{r.label}</span><span className="text-[11px] text-ink/60">{r.detail}</span></div>
                  <Bar value={r.progress} height="h-2" color={r.met ? '#a6d9d1' : undefined} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="The Income Engine">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Tile label={`Conversations · goal ${WEEKLY_CONVERSATIONS}`} value={String(leads.conversations)} tone={leads.conversations >= WEEKLY_CONVERSATIONS ? 'text-ok' : 'text-gold'} />
            <Tile label="Proposals" value={String(leads.proposals)} />
            <Tile label="Case studies" value={String(leads.caseStudies)} />
          </div>
          <p className="mt-2 text-[12px] text-ink/60">{leads.stageMoves} lead{leads.stageMoves === 1 ? '' : 's'} moved stage. Log them in <Link to="/money" className="underline">Treasury · pipeline</Link>.</p>
        </Card>
      </div>

      <ReviewForm key={monday} monday={monday} saved={data.review} paid={data.paid} isCurrent={isCurrent} openQuests={openQuests} areas={data.areas.filter(a => !a.archived)} />

      <Card title="Close the week · backup">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="gold" onClick={async () => { download(`life-backup-${dateKey()}.json`, JSON.stringify(await exportAll())); await setSetting('lastBackupAt', Date.now()); }}><Glyph name="download" size={16} />Export backup</Button>
          <span className="text-sm text-ink/70">{data.lastBackup ? `Last backup: ${new Date(data.lastBackup).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'No backup exported from here yet.'} Everything lives on this device until sync exists.</span>
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="mac-inset bg-white p-2"><div className="text-[11px] text-lav">{label}</div><div className={cx('font-display text-xl', tone)}>{value}</div></div>;
}

function ReviewForm({ monday, saved, paid, isCurrent, openQuests, areas }: {
  monday: string; saved?: { wins: string[]; nextQuestIds: string[]; note?: string }; paid: boolean; isCurrent: boolean;
  openQuests: Task[]; areas: { id: string; name: string; short: string }[];
}) {
  const [wins, setWins] = useState<string[]>(() => Array.from({ length: REVIEW_WINS }, (_, i) => saved?.wins[i] ?? ''));
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: REVIEW_QUESTS }, (_, i) => ({ ...emptySlot(), taskId: saved?.nextQuestIds[i] ?? '' })));
  const [note, setNote] = useState(saved?.note ?? '');
  const [msg, setMsg] = useState('');
  const fallbackArea = areas[0]?.id ?? '';
  const chosen = slots.map(s => s.taskId || (s.title.trim() ? `new:${s.title}` : ''));
  const complete = reviewComplete(wins, chosen.filter(Boolean));
  // Quests already done stay listed in the review they were chosen in.
  const options = (id: string) => openQuests.filter(q => q.id === id || !slots.some(s => s.taskId === q.id));

  const save = async () => {
    const ids = await saveReview({
      monday, wins, note,
      questIds: slots.filter(s => s.taskId).map(s => s.taskId),
      newQuests: slots.filter(s => !s.taskId && s.title.trim()).map(s => ({ title: s.title, areaId: s.areaId || fallbackArea }))
    });
    // New quests now exist: point their slots at them so a second save doesn't create them again.
    setSlots(Array.from({ length: REVIEW_QUESTS }, (_, i) => ({ ...emptySlot(), taskId: ids[i] ?? '' })));
    setMsg(complete ? (isCurrent ? 'Saved. The week is closed.' : 'Saved.') : `Saved as a draft: ${REVIEW_WINS} wins and ${REVIEW_QUESTS} quests make it count.`);
  };

  return (
    <Card title="Your review">
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-display text-sm text-lav">Top {REVIEW_WINS} wins of the week</legend>
          {wins.map((w, i) => <Input key={i} aria-label={`Win ${i + 1}`} value={w} onChange={e => setWins(wins.map((x, j) => (j === i ? e.target.value : x)))} placeholder={['e.g. sent the proposal to the museum', 'e.g. 4 days of exercise', 'e.g. paid every statement in full'][i]} />)}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-display text-sm text-lav">Next week's top {REVIEW_QUESTS} quests</legend>
          {slots.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr]">
              <Select aria-label={`Quest ${i + 1}`} value={s.taskId} onChange={e => setSlots(slots.map((x, j) => (j === i ? { ...x, taskId: e.target.value } : x)))}>
                <option value="">New quest…</option>
                {options(s.taskId).map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                {s.taskId && !openQuests.some(q => q.id === s.taskId) && <option value={s.taskId}>(done)</option>}
              </Select>
              {!s.taskId && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input aria-label={`New quest ${i + 1}`} value={s.title} onChange={e => setSlots(slots.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="a new quest" />
                  <Select aria-label={`Area for quest ${i + 1}`} value={s.areaId || fallbackArea} onChange={e => setSlots(slots.map((x, j) => (j === i ? { ...x, areaId: e.target.value } : x)))} className="!w-28">
                    {areas.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}
                  </Select>
                </div>
              )}
            </div>
          ))}
          <p className="text-[12px] text-ink/60">New quests are created as Medium, "This week", due next Sunday.</p>
        </fieldset>
        <Label text="Note (what to change next week)"><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="move 2 hours from the lowest-paying activity to the highest…" /></Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save}><Glyph name="check" size={16} />Save review</Button>
          {saved && <Button variant="danger" aria-label="Delete review" onClick={async () => { if (confirm('Delete this review? Its XP is taken back.')) { await deleteReview(monday); setMsg('Deleted.'); } }}><Glyph name="trash" size={16} /></Button>}
          <span className="text-sm text-ink/70">
            {paid ? <span className="text-ok">+{REVIEW_XP} XP earned for this week</span>
              : isCurrent ? (complete ? `Saving pays +${REVIEW_XP} XP · ${coinsFor(REVIEW_XP)} dr` : `${REVIEW_WINS} wins and ${REVIEW_QUESTS} quests pay +${REVIEW_XP} XP`)
              : 'Past week: no XP'}
          </span>
        </div>
        {msg && <p role="status" className="font-type text-sm">{msg}</p>}
      </div>
    </Card>
  );
}
