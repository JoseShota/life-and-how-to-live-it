// E-9: the season banner and the fresh-start banners on Today, and the season card in Control.
import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
import { Glyph } from '@/components/Glyph';
import { db, setSetting } from '@/db/db';
import type { Task } from '@/db/types';
import { REVIEW_XP, reviewWeekFor } from '@/game/rules';
import { getTaxProfile } from '@/game/engine';
import { monthTotals } from '@/finance/finance';
import { monthTax, monthlyDueDate } from '@/finance/tax';
import {
  SEASON_1_ID, SEASON_BOSS, SEASON_DAYS, SEASON_NAME, SEASON_REVIEW_PHASE, SEASON_WEEKS, freshStartFor, seasonStatus, withDismissed,
  type FreshStart, type SeasonSetting
} from '@/game/season';
import { cx, mxn, parseKey } from '@/lib/util';
import { Card, Input, Label } from './ui';

const longDate = (key: string) => parseKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (key: string) => parseKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const monthName = (ym: string) => parseKey(`${ym}-01`).toLocaleDateString('en-US', { month: 'long' });
const linkCls = 'flex min-h-[40px] w-fit items-center gap-2 font-display text-[13px] text-lav hover:text-xp';

/** The season setting: undefined while loading, null when not set. */
export function useSeason(): SeasonSetting | null | undefined {
  const row = useLiveQuery(async () => (await db.settings.get('season')) ?? null);
  return row === undefined ? undefined : (row?.value as SeasonSetting | undefined) ?? null;
}

/** Today: where the season stands. Text only; live boss progress arrives with P4-4. */
export function SeasonBanner({ today }: { today: string }) {
  const season = useSeason();
  if (season === undefined) return null;
  const st = seasonStatus(today, season);
  if (st.state === 'unset') return (
    <Card className="!py-2">
      <Link to="/settings#season" className={linkCls}><Glyph name="laurel" size={16} />Set the {SEASON_NAME} start date in Control</Link>
    </Card>
  );
  if (st.state === 'after') return (
    <Card className="!py-2">
      <p className="text-sm">{SEASON_NAME} ended on {longDate(st.end)}.</p>
      <Link to="/settings#season" className={linkCls}><Glyph name="laurel" size={16} />Season settings</Link>
    </Card>
  );
  const title = st.state === 'before' ? `${SEASON_NAME} starts ${st.daysUntil === 1 ? 'tomorrow' : `in ${st.daysUntil} days`}`
    : st.state === 'review' ? `${SEASON_NAME} · season review · day ${st.day} of ${SEASON_DAYS}`
    : `${SEASON_NAME} · week ${st.week} of ${SEASON_WEEKS} · day ${st.day} of ${SEASON_DAYS}`;
  const phase = st.state === 'running' ? st.phase : st.state === 'review' ? SEASON_REVIEW_PHASE : null;
  return (
    <Card title={title} className="bg-lav/10">
      <div className="flex flex-col gap-1 text-sm">
        {st.state === 'before' && <p>From {longDate(st.start)} to {longDate(st.end)}: 90 days, 12 weeks.</p>}
        {phase && <p><span className="font-display text-lav">Focus</span> · {phase.focus}</p>}
        {phase && <p><span className="font-display text-lav">Done when</span> · {phase.doneWhen}</p>}
        <p className="text-ink/70"><span className="font-display text-lav">Boss</span> · {SEASON_BOSS}</p>
      </div>
    </Card>
  );
}

/** Today: at most one fresh-start banner (Sunday review, Monday, or the first days of a month). */
export function FreshStartBanner({ today }: { today: string }) {
  const monday = reviewWeekFor(today);
  const ctx = useLiveQuery(async () => ({
    reviewPaid: (await db.xp.where('refId').equals(`review:${monday}`).count()) > 0,
    dismissed: (await db.settings.get('freshStartDismissed'))?.value as string[] | undefined
  }), [monday]);
  if (!ctx) return null;
  const fresh = freshStartFor(today, ctx);
  if (!fresh) return null;
  if (fresh.kind === 'sunday-review') return <SundayReview />;
  // Read the stored list at the moment of closing, so a close on the other device that already synced is kept.
  const dismiss = async () => setSetting('freshStartDismissed', withDismissed((await db.settings.get('freshStartDismissed'))?.value as string[] | undefined, fresh.key));
  return fresh.kind === 'monday' ? <MondayBanner monday={monday} onClose={dismiss} /> : <MonthBanner fresh={fresh} today={today} onClose={dismiss} />;
}

const CloseButton = ({ onClose, what }: { onClose: () => void; what: string }) => (
  <button onClick={onClose} aria-label={`Close the ${what} banner`} title="Close (on both devices)" className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center text-ink/50 hover:text-xp"><Glyph name="close" size={14} /></button>
);

/** Sundays: the weekly review (read the plan, look back, choose three, back up). Gone once it pays. */
function SundayReview() {
  return (
    <Card title="Sunday · the weekly review" className="bg-laurel/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-type text-[15px]">thirty minutes. look back at the week, write three wins, choose three quests, export a backup.</p>
        <Link to="/review" className="mac-btn mac-default inline-flex min-h-[40px] items-center gap-2 bg-laurel px-4 font-display text-[15px]"><Glyph name="scroll" size={16} />Review the week · +{REVIEW_XP} XP</Link>
      </div>
    </Card>
  );
}

/** Mondays: last week's review if it isn't saved (it still pays until Saturday), else the three quests it chose. */
function MondayBanner({ monday, onClose }: { monday: string; onClose: () => void }) {
  const data = useLiveQuery(async () => {
    const review = await db.reviews.get(monday);
    const quests = review ? (await db.tasks.bulkGet(review.nextQuestIds)).filter((t): t is Task => !!t) : [];
    return { review, quests };
  }, [monday]);
  if (!data) return null;
  return (
    <Card title="Monday · a new week" className="bg-mint/20">
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1">
      {!data.review ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-type text-[15px]">last week isn't reviewed yet. it still pays until saturday: three wins, three quests.</p>
          <Link to="/review" className="mac-btn mac-default inline-flex min-h-[40px] items-center gap-2 bg-laurel px-4 font-display text-[15px]"><Glyph name="scroll" size={16} />Review last week · +{REVIEW_XP} XP</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="font-type text-[15px]">the three quests you chose for this week:</p>
          {data.quests.length === 0 ? <p className="text-sm text-ink/60">None of them are on the board any more.</p> : (
            <ol className="flex flex-col">
              {data.quests.map(t => (
                <li key={t.id} className={cx('flex min-h-[32px] items-center gap-2 text-sm', t.status === 'done' && 'text-ink/50 line-through')}>
                  <Glyph name={t.status === 'done' ? 'check' : 'dot'} size={14} className="shrink-0 text-cyan" />{t.title}
                </li>
              ))}
            </ol>
          )}
          <Link to="/quests" className={linkCls}><Glyph name="scroll" size={14} />Open quests</Link>
        </div>
      )}
      </div><CloseButton onClose={onClose} what="new week" /></div>
    </Card>
  );
}

/** The first days of a month: how last month closed, the split, and the RESICO estimate due on the 17th. */
function MonthBanner({ fresh, today, onClose }: { fresh: Extract<FreshStart, { kind: 'month' }>; today: string; onClose: () => void }) {
  const data = useLiveQuery(async () => {
    const txs = await db.transactions.toArray();
    const profile = await getTaxProfile();
    return { totals: monthTotals(txs, fresh.month), tax: profile?.regime === 'resico' ? monthTax(txs, fresh.month) : null };
  }, [fresh.month]);
  if (!data) return null;
  const { totals, tax } = data;
  const name = monthName(fresh.month);
  const due = monthlyDueDate(fresh.month);
  return (
    <Card title={`${monthName(today.slice(0, 7))} · a new month`} className="bg-gold/10">
      <div className="flex items-start gap-3"><div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p>{name} closed at <b>{mxn(totals.income)}</b> in, <b>{mxn(totals.expense)}</b> out{totals.savingsRate === null ? '.' : <>, a savings rate of <b className={totals.savingsRate >= 0.3 ? 'text-ok' : totals.savingsRate < 0 ? 'text-hp' : ''}>{Math.round(totals.savingsRate * 100)}%</b>.</>}</p>
        <p>Split any income you haven't split yet: each income in Treasury has a Split button.</p>
        {tax && <p>RESICO for {name}: about <b>{mxn(tax.totalDue)}</b> to declare by {shortDate(due)}.</p>}
        <div className="flex flex-wrap gap-x-4">
          <Link to="/money" className={linkCls}><Glyph name="drachma" size={14} />Treasury</Link>
          {tax && <Link to="/money#tax" className={linkCls}><Glyph name="scales" size={14} />Tax estimate</Link>}
        </div>
      </div><CloseButton onClose={onClose} what="new month" /></div>
    </Card>
  );
}

/** Control: the season start date (synced, so both devices show the same week). */
export function SeasonCard({ today }: { today: string }) {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (location.hash === '#season') ref.current?.scrollIntoView({ block: 'start' }); }, [location.hash]);
  const season = useSeason();
  const st = seasonStatus(today, season);
  return (
    <div ref={ref} id="season" className="scroll-mt-24">
      <Card title={`Season · ${SEASON_NAME}`}>
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-ink/60">A 90-day campaign in 12 weeks (the master plan, §6). Weeks run Monday to Sunday, like the weekly review; after week 12 come the days of the season review.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="Start date">
              <Input type="date" value={season?.start ?? ''} onChange={e => { if (e.target.value) setSetting('season', { id: season?.id ?? SEASON_1_ID, start: e.target.value }); }} />
            </Label>
          </div>
          {st.state !== 'unset' && <p className="text-ink/70">Ends on {longDate(st.end)}.{st.state === 'running' ? ` Today is week ${st.week} of ${SEASON_WEEKS}, day ${st.day}.` : ''}</p>}
        </div>
      </Card>
    </div>
  );
}
