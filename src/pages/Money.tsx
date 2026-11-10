import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { subDays } from 'date-fns';
import { db } from '@/db/db';
import type { Account, AccountRole, BankKey, Goal, IncomeTax, Invoice, IncomeTaxKind, Installment, Opportunity, OpportunityKind, OpportunityStatus, PipelineEventKind, Statement, Transaction, TxKind } from '@/db/types';
import { balanceOf, cardStatus, monthTotals, expenseByCategory, hoursOfWork, SHARED_WORK_AREA, pipelineValue, netWorth, splitLegs, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  BANKS, dueDaysFor, lastCutoff, dueDateFor, estimateStatement, statementStatus, newSinceCutoff, installmentRemaining } from '@/finance/finance';
import { deleteOpportunity, deletePipelineEvent, deleteStatement, deleteTransaction, editTransaction, evaluateStatements, getTaxProfile, isStale, weekStartKey, logPipelineEvent, saveOpportunity, rewardGoalProgress, rewardTransactionLogged, saveStatement, setInstallments, transfer } from '@/game/engine';
import { checkAchievements } from '@/game/achievements';
import { FINANCE_XP, LEAD_XP, WEEKLY_CONVERSATIONS } from '@/game/rules';
import { cx, dateKey, mxn, parseKey, uid } from '@/lib/util';
import { Bar, Button, Card, Chip, Empty, Input, Label, Modal, Select, PageTitle } from '@/components/ui';
import { WealthRoad } from '@/components/WealthRoad';
import { RealRateCard, useRealRates } from '@/components/RealRate';
import { useToast } from '@/lib/toast';
import { SplitSheet, TaxCard } from '@/components/TaxBits';
import { ImportSheet, InvoicesCard } from '@/components/MoneyTools';
import { IVA_RATE, invoiceFromSubtotal } from '@/finance/tax';

const PIE = ['#e3b9b2', '#a6d9d1', '#c7c2e3', '#b9cfe0', '#dccb98', '#e8c9a0', '#bcd3c6', '#a8383a', '#d4d9d6'];

export default function Money() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const txs = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], []);
  const goals = useLiveQuery(() => db.goals.orderBy('order').toArray(), [], []);
  const opps = useLiveQuery(() => db.opportunities.toArray(), [], []);
  const [txOpen, setTxOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editAcc, setEditAcc] = useState<Account | null>(null);
  const [editOpp, setEditOpp] = useState<Opportunity | 'new' | null>(null);
  const [stmtFor, setStmtFor] = useState<{ acc: Account; st?: Statement } | null>(null);
  const [payFor, setPayFor] = useState<{ acc: Account; amount: number } | null>(null);
  const [splitTx, setSplitTx] = useState<Transaction | null>(null);
  const [importing, setImporting] = useState(false);
  const [payInv, setPayInv] = useState<Invoice | null>(null);
  const statements = useLiveQuery(() => db.statements.toArray(), [], []);
  const installments = useLiveQuery(() => db.installments.toArray(), [], []);

  const month = monthTotals(txs);
  const cats = expenseByCategory(txs);
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const nw = netWorth(allAccounts, txs);
  // "This purchase = N hours of your work", at the 90-day average real rate (Your Money or Your Life).
  const avgRate = useRealRates(dateKey(subDays(new Date(), 89)), dateKey())?.average ?? null;
  const debt = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + Math.max(0, -balanceOf(a, txs)), 0);
  // What's actually due now: the unpaid part of each card's latest statement (pago para no generar intereses).
  const latest = (accId: string) => statements.filter(x => x.accountId === accId).sort((a, b) => b.cutoffDate.localeCompare(a.cutoffDate))[0];
  const dueNow = accounts.filter(a => a.type === 'credit').reduce((sum, a) => {
    const st = latest(a.id);
    return sum + (st ? statementStatus(a, txs, st).remaining : 0);
  }, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="宝庫" plain="money" sub="banorte ×4, cash, and the long road to the first million" right={<Button variant="gold" onClick={() => setTxOpen(true)}><Glyph name="plus" size={16}/>Transaction</Button>}>Treasury</PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net worth" value={mxn(nw)} tone={nw >= 0 ? 'text-ok' : 'text-hp'} />
        <Stat label="Statements due" value={mxn(dueNow)} tone={dueNow > 0 ? 'text-gold' : 'text-ok'} sub={`Total card balance ${mxn(debt)}`} />
        <Stat label="Income · this month" value={mxn(month.income)} />
        <Stat label="Savings rate" value={month.savingsRate === null ? '—' : `${Math.round(month.savingsRate * 100)}%`} tone={month.savingsRate === null ? 'text-ink/60' : month.savingsRate >= 0.3 ? 'text-ok' : month.savingsRate > 0 ? 'text-gold' : 'text-hp'} sub={month.savingsRate === null ? `No income yet · spent ${mxn(month.expense)}` : `Spent ${mxn(month.expense)}`} />
      </div>

      <Card title="Accounts">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map(a => a.type === 'credit'
            ? <CardTile key={a.id} acc={a} txs={txs} statements={statements.filter(x => x.accountId === a.id)} installments={installments.filter(i => i.accountId === a.id)}
                onEdit={() => setEditAcc(a)} onStatement={st => setStmtFor({ acc: a, st })} onPay={amount => setPayFor({ acc: a, amount })} />
            : (
              <div key={a.id} className="mac-window p-3" style={{ background: `linear-gradient(135deg, ${a.color}66, #ffffff 75%)` }}>
                <div className="flex items-start justify-between">
                  <div><div className="text-sm font-semibold">{a.name}</div><div className="text-[11px] uppercase tracking-wider text-ink/60">{a.type}</div></div>
                  <button onClick={() => setEditAcc(a)} className="-m-2 flex h-10 w-10 items-center justify-center text-ink/60 hover:text-xp" aria-label={`Edit ${a.name}`}><Glyph name="pencil" size={14}/></button>
                </div>
                <div className={cx('mt-2 font-display text-3xl leading-8', balanceOf(a, txs) < 0 ? 'text-hp' : 'text-ok')}>{mxn(balanceOf(a, txs), 2)}</div>
              </div>
            ))}
        </div>
      </Card>

      <WealthRoad />
      <TaxCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <RealRateCard />

        <Card title="Spending · this month">
          {cats.length === 0 ? <Empty>No expenses logged this month.</Empty> : (
            <div className="flex items-center gap-4">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer><PieChart><Pie data={cats} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} stroke="none">{cats.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip formatter={(v: number) => mxn(v)} contentStyle={{ background: '#fbfaf6', border: '1px solid #2b3437', borderRadius: 12 }} /></PieChart></ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1 text-sm">{cats.slice(0, 7).map((c, i) => <li key={c.name} className="flex justify-between"><span><span className="mr-2 inline-block h-2 w-2" style={{ background: PIE[i % PIE.length] }} />{c.name}</span><span>{mxn(c.value)}</span></li>)}</ul>
            </div>
          )}
        </Card>

        <PipelineCard opps={opps} onEdit={setEditOpp} />

        <Card title="Wealth Goals">
          <div className="flex flex-col gap-3">{goals.map(g => <GoalRow key={g.id} g={g} />)}</div>
        </Card>
      </div>

      <InvoicesCard onPaid={setPayInv} />

      <Card title="The Ledger" action={<Button variant="ghost" className="!px-3" onClick={() => setImporting(true)}><Glyph name="download" size={16} />Import a statement</Button>}>
        {txs.length === 0 ? <Empty>Nothing logged yet. The wealth engine needs every peso to rank your hours.</Empty> : (
          <ul className="divide-y divide-line">
            {txs.slice(0, 30).map(t => {
              const acc = accounts.find(a => a.id === t.accountId);
              const area = areas.find(a => a.id === t.areaId);
              return (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-12 shrink-0 text-[11px] text-ink/55">{t.date.slice(5)}</span>
                  <div className="min-w-0 flex-1"><div className="truncate">{t.description || t.category}</div><div className="text-[11px] text-ink/55">{acc?.name} · {t.category}{area ? ` · ${area.short}` : t.areaId === SHARED_WORK_AREA ? ' · shared work cost' : ''}{t.kind === 'expense' && (hoursOfWork(t.amount, avgRate) ?? 0) >= 1 ? ` · ≈ ${hoursOfWork(t.amount, avgRate)!.toFixed(1)} h of work` : ''}</div></div>
                  <span className={cx('shrink-0 font-semibold', t.amount >= 0 ? 'text-ok' : 'text-ink/90')}>{mxn(t.amount, 2)}</span>
                  <div className="-my-1 flex shrink-0">
                    {t.kind === 'income' && <button className="flex h-10 w-10 items-center justify-center text-ink/45 hover:text-cyan focus-visible:text-cyan" aria-label="Split this income" title="Split it" onClick={() => setSplitTx(t)}><Glyph name="scales" size={16}/></button>}
                    <button className="flex h-10 w-10 items-center justify-center text-ink/45 hover:text-xp focus-visible:text-xp" aria-label="Edit transaction" onClick={() => setEditTx(t)}><Glyph name="pencil" size={16}/></button>
                    <button className="flex h-10 w-10 items-center justify-center text-ink/40 hover:text-hp focus-visible:text-hp" aria-label="Delete transaction" onClick={async () => {
                      if (!confirm(t.transferId ? 'Delete this transfer (both sides)?' : 'Delete transaction?')) return;
                      await deleteTransaction(t);
                    }}><Glyph name="trash" size={16}/></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <TxForm open={txOpen} onClose={() => setTxOpen(false)} onIncome={setSplitTx} />
      {splitTx && <SplitSheet tx={splitTx} onClose={() => setSplitTx(null)} />}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
      {/* An invoice was paid: log the deposit (with its tax fields), link it, then offer to split it. */}
      {payInv && <TxForm open preset={{ kind: 'income', amount: payInv.amount, description: `${payInv.client}${payInv.concept ? ` · ${payInv.concept}` : ''}`, areaId: payInv.areaId }} onClose={() => setPayInv(null)}
        onIncome={async tx => { await db.invoices.update(payInv.id, { paidDate: tx.date, txId: tx.id }); setSplitTx(tx); }} />}
      {payFor && <TxForm open preset={{ kind: 'transfer', toId: payFor.acc.id, amount: payFor.amount, description: `Pago ${payFor.acc.name}` }} onClose={() => setPayFor(null)} />}
      {stmtFor && <StatementForm acc={stmtFor.acc} st={stmtFor.st} txs={txs} installments={installments} onClose={() => setStmtFor(null)} />}
      {editTx && <TxForm open tx={editTx} legs={editTx.transferId ? txs.filter(x => x.transferId === editTx.transferId) : [editTx]} onClose={() => setEditTx(null)} />}
      {editAcc && <AccountForm acc={editAcc} onClose={() => setEditAcc(null)} />}
      {editOpp && <OppForm opp={editOpp === 'new' ? undefined : editOpp} onClose={() => setEditOpp(null)} />}
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return <Card className="!p-3"><div className="text-[11px] uppercase tracking-wider text-lav">{label}</div><div className={cx('font-display text-3xl leading-8 sm:text-4xl', tone)}>{value}</div>{sub && <div className="text-[11px] text-ink/55">{sub}</div>}</Card>;
}

function GoalRow({ g }: { g: Goal }) {
  const [v, setV] = useState<string>('');
  return (
    <div>
      <div className="flex items-center justify-between text-sm"><span className="inline-flex items-center gap-1.5"><Glyph name={g.icon} size={16} />{g.name}</span><span className="text-ink/60">{g.target === 1 ? (g.current >= 1 ? 'done' : '—') : `${mxn(g.current)} / ${mxn(g.target)}`}</span></div>
      <Bar value={g.current / g.target} color="#dccb98" className="mt-1.5" />
      <div className="mt-1.5 flex gap-2">
        <Input className="text-xs" placeholder={g.target === 1 ? '1 = done' : 'Update current amount'} inputMode="decimal" value={v} onChange={e => setV(e.target.value)} />
        <Button variant="ghost" className="!px-3 text-xs" onClick={async () => {
          const n = Number(v); if (Number.isNaN(n) || v === '') return;
          const before = g.current;
          await db.goals.update(g.id, { current: n });
          if (n > before) await rewardGoalProgress(g.id, g.name);
          setV('');
        }}>Update</Button>
      </div>
    </div>
  );
}

const MSI_MONTHS = [3, 6, 9, 12, 18, 24];
const ROLE_LABEL: Record<AccountRole, string> = { operating: 'Operating (living costs)', tax: 'Tax reserve', shield: 'Shield (emergency fund)', invest: 'Investments', skills: 'Skills', fun: 'Fun (guilt-free)' };
const fmtDay = (k: string) => new Date(k + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/**
 * A credit card, read like its Banorte statement: what's due to avoid interest, by when, how much is paid,
 * and what's new since the cut-off (that goes on the next statement).
 */
function CardTile({ acc, txs, statements, installments, onEdit, onStatement, onPay }: {
  acc: Account; txs: Transaction[]; statements: Statement[]; installments: Installment[];
  onEdit: () => void; onStatement: (st?: Statement) => void; onPay: (amount: number) => void;
}) {
  const c = cardStatus(acc, txs);
  const st = [...statements].sort((a, b) => b.cutoffDate.localeCompare(a.cutoffDate))[0];
  const status = st ? statementStatus(acc, txs, st) : null;
  const cut = acc.cutoffDay ? lastCutoff(acc.cutoffDay) : undefined;
  // Only ask for a statement when something was owed at that cut-off.
  const missing = cut && (!st || st.cutoffDate < cut) && estimateStatement(acc, txs, installments, cut).statementBalance > 0;
  const newCharges = newSinceCutoff(acc, txs, st?.cutoffDate ?? cut ?? '0000-00-00');
  const msiPending = installments.reduce((s, i) => s + installmentRemaining(i, cut ?? '0000-00-00'), 0);
  const chip = status && { paid: ['paid in full', '#a6d9d1'], due: [`due in ${status.daysToDue}d`, status.daysToDue <= 5 ? '#e3b9b2' : '#e5d6a1'], late: ['late: interest', '#a8383a'], 'nothing-due': ['nothing due', '#d4d9d6'] }[status.state];
  return (
    <div className="mac-window p-3" style={{ background: `linear-gradient(135deg, ${acc.color}66, #ffffff 75%)` }}>
      <div className="flex items-start justify-between">
        <div><div className="text-sm font-semibold">{acc.name}</div><div className="text-[11px] uppercase tracking-wider text-ink/60">{acc.bank ? BANKS[acc.bank].name : acc.institution} · credit</div></div>
        <button onClick={onEdit} className="-m-2 flex h-10 w-10 items-center justify-center text-ink/60 hover:text-xp" aria-label={`Edit ${acc.name}`}><Glyph name="pencil" size={14}/></button>
      </div>
      <div className={cx('mt-2 font-display text-3xl leading-8', c.balance < 0 ? 'text-hp' : 'text-ok')}>{mxn(c.balance, 2)}</div>
      <div className="text-[11px] text-ink/60">total balance{acc.creditLimit ? ` · ${Math.round(c.utilization * 100)}% of limit used (keep < 30%)` : ''}</div>
      {acc.creditLimit ? <Bar value={c.utilization} color={c.utilization > 0.3 ? '#a8383a' : '#a6d9d1'} height="h-3" className="mt-1" /> : <div className="mt-1 text-[11px] text-gold">Set limit and cut-off day (pencil)</div>}

      {st && status && (
        <div className="mac-inset mt-3 bg-white/80 p-2 text-[12px]">
          <div className="flex items-center justify-between gap-2"><span className="font-display text-[13px]">Statement · corte {fmtDay(st.cutoffDate)}</span>{chip && <Chip color={chip[1]}>{chip[0]}</Chip>}</div>
          <div className="mt-1 flex items-baseline justify-between"><span>Pago para no generar intereses</span><b className="font-display text-base">{mxn(st.noInterestPayment, 2)}</b></div>
          <div className="flex justify-between text-ink/70"><span>Paid since corte</span><span>{mxn(status.paid, 2)}</span></div>
          {status.remaining > 0 && <div className="flex justify-between text-hp"><span>Left to pay by {fmtDay(st.dueDate)}</span><b>{mxn(status.remaining, 2)}</b></div>}
          <div className="flex justify-between text-ink/55"><span>Pago mínimo (emergencies only)</span><span>{mxn(st.minimumPayment, 2)}</span></div>
        </div>
      )}
      <div className="mt-2 space-y-0.5 text-[11px] text-ink/60">
        {newCharges > 0 && <div>New since corte: {mxn(newCharges, 2)} (next statement)</div>}
        {msiPending > 0 && <div>Meses sin intereses still to bill: {mxn(msiPending, 2)}</div>}
        {acc.cutoffDay && <div>Next corte {c.nextCutoff ? fmtDay(dateKey(c.nextCutoff)) : '—'} · pay {dueDaysFor(acc)} days after each corte</div>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {missing && <Button variant="gold" className="!px-3 text-sm" onClick={() => onStatement()}><Glyph name="scroll" size={14}/>Enter statement · corte {fmtDay(cut!)}</Button>}
        {st && <Button variant="ghost" className="!px-3 text-sm" onClick={() => onStatement(st)}>Statement</Button>}
        {status && status.remaining > 0 && <Button className="!px-3 text-sm" onClick={() => onPay(status.remaining)}>Pay {mxn(status.remaining, 2)}</Button>}
      </div>
    </div>
  );
}

/** Enter the exact amounts from the bank statement. The ledger only prefills an estimate. */
function StatementForm({ acc, st, txs, installments, onClose }: { acc: Account; st?: Statement; txs: Transaction[]; installments: Installment[]; onClose: () => void }) {
  const cut = st?.cutoffDate ?? (acc.cutoffDay ? lastCutoff(acc.cutoffDay) : dateKey());
  const [cutoffDate, setCutoff] = useState(cut);
  const [dueDate, setDue] = useState(st?.dueDate ?? dueDateFor(acc, cut));
  const est = estimateStatement(acc, txs, installments, cutoffDate);
  const [balance, setBalance] = useState(st ? String(st.statementBalance) : String(est.statementBalance));
  const [noInt, setNoInt] = useState(st ? String(st.noInterestPayment) : String(est.noInterestPayment));
  const [minimum, setMinimum] = useState(st ? String(st.minimumPayment) : '');
  const [err, setErr] = useState('');
  const save = async () => {
    const n = (v: string) => Number(v.replace(/[,$\s]/g, ''));
    if ([balance, noInt].some(v => v === '' || Number.isNaN(n(v)))) { setErr('Type the amounts from your statement.'); return; }
    if (dueDate <= cutoffDate) { setErr('The due date must be after the cut-off.'); return; }
    await saveStatement({ id: st?.id ?? uid(), accountId: acc.id, cutoffDate, dueDate, statementBalance: n(balance), noInterestPayment: n(noInt), minimumPayment: n(minimum || '0'), createdAt: st?.createdAt ?? Date.now() });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Statement · ${acc.name}`}>
      <div className="flex flex-col gap-3">
        <p className="font-type text-sm text-ink/70">Copy the numbers from your {acc.bank ? BANKS[acc.bank].name : ''} statement (estado de cuenta). The ledger estimate is prefilled: pago para no generar intereses ≈ {mxn(est.noInterestPayment, 2)}{est.msiFuture > 0 ? `, after leaving out ${mxn(est.msiFuture, 2)} of meses sin intereses not billed yet` : ''}.</p>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Fecha de corte"><Input type="date" value={cutoffDate} onChange={e => { setCutoff(e.target.value); if (!st) setDue(dueDateFor(acc, e.target.value)); }} /></Label>
          <Label text="Fecha límite de pago"><Input type="date" value={dueDate} onChange={e => setDue(e.target.value)} /></Label>
        </div>
        <Label text="Pago para no generar intereses"><Input inputMode="decimal" value={noInt} onChange={e => setNoInt(e.target.value)} className="text-lg font-bold" /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Saldo al corte"><Input inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} /></Label>
          <Label text="Pago mínimo"><Input inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} placeholder="0.00" /></Label>
        </div>
        {err && <p role="alert" className="font-type text-sm text-hp">{err}</p>}
        <p className="text-xs text-ink/60">Paying the pago para no generar intereses by the due date earns +{FINANCE_XP.payCardInFull} XP for this statement and keeps you a totalero.</p>
        <div className="flex gap-2">
          {st && <Button variant="danger" aria-label="Delete statement" onClick={async () => { if (confirm('Delete this statement?')) { await deleteStatement(st); onClose(); } }}><Glyph name="trash" size={16}/></Button>}
          <Button variant="gold" className="flex-1" onClick={save}>Save statement</Button>
        </div>
      </div>
    </Modal>
  );
}

interface TxPreset { kind: TxKind; toId?: string; amount?: number; description?: string; areaId?: string }

/** Add a transaction, or edit `tx` (with all its `legs` when it's a transfer). Editing keeps the kind and the XP. */
function TxForm({ open, onClose, tx, legs = [], preset, onIncome }: { open: boolean; onClose: () => void; tx?: Transaction; legs?: Transaction[]; preset?: TxPreset; onIncome?: (tx: Transaction) => void }) {
  const { from, to: toLeg } = tx?.transferId ? splitLegs(legs) : { from: tx, to: undefined };
  // Keep the accounts this transaction already uses selectable even if they've been archived since.
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter(a => !a.archived || a.id === from?.accountId || a.id === toLeg?.accountId).toArray(), [from?.accountId, toLeg?.accountId], []);
  const allAreas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const areas = allAreas.filter(a => a.monetizable);
  const plan = useLiveQuery(() => (tx?.installmentId ? db.installments.get(tx.installmentId) : undefined), [tx?.installmentId]);
  const [kind, setKind] = useState<TxKind>(tx?.kind ?? preset?.kind ?? 'expense');
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount)) : preset?.amount ? String(preset.amount) : '');
  const [accountId, setAccountId] = useState(from?.accountId ?? '');
  const [toId, setToId] = useState(toLeg?.accountId ?? preset?.toId ?? '');
  const [category, setCategory] = useState(tx && tx.kind !== 'transfer' ? tx.category : '');
  // New expenses start on the last category used (default Food), not on the first item of the list.
  const lastCat = useLiveQuery(() => db.settings.get('lastExpenseCategory'))?.value as string | undefined;
  const profile = useLiveQuery(() => getTaxProfile());
  const cat = category || (kind === 'expense' ? lastCat ?? 'Food' : kind === 'income' ? (profile?.regime === 'resico' ? 'Freelance' : INCOME_CATEGORIES[0]) : '');
  const catOptions = (list: string[]) => (cat && !list.includes(cat) ? [cat, ...list] : list);
  const [areaId, setAreaId] = useState(tx?.areaId ?? preset?.areaId ?? '');
  const [date, setDate] = useState(tx?.date ?? dateKey());
  const [desc, setDesc] = useState(tx?.description ?? preset?.description ?? '');
  const [msi, setMsi] = useState<string | null>(null);
  // Income tax (v6). RESICO invoices compute the deposit from the subtotal; salary keeps its gross for the cap.
  const [taxKind, setTaxKind] = useState<IncomeTaxKind | ''>(tx?.incomeTax?.kind ?? '');
  const [subtotal, setSubtotal] = useState(tx?.incomeTax ? String(tx.incomeTax.subtotal) : '');
  const [withIva, setWithIva] = useState<boolean | null>(tx?.incomeTax ? tx.incomeTax.ivaCharged > 0 : null);
  const [company, setCompany] = useState(tx?.incomeTax?.clientIsCompany ?? false);
  const [ivaExpense, setIvaExpense] = useState(!!tx?.ivaCreditable);
  const acc = accountId || accounts.find(a => a.type !== 'credit' && a.id !== preset?.toId)?.id || accounts[0]?.id;
  const accObj = accounts.find(a => a.id === acc);
  const to = toId || accounts.find(a => a.id !== acc)?.id;
  const msiValue = msi ?? (plan ? String(plan.months) : '');
  const isCardExpense = kind === 'expense' && accObj?.type === 'credit';
  const resico = profile?.regime === 'resico';
  const effTaxKind: IncomeTaxKind = taxKind || (cat === 'Salary' ? 'salary' : resico && ['Freelance', 'Class', 'Royalties/Content'].includes(cat) ? 'resico' : 'none');
  const invoice = kind === 'income' && effTaxKind === 'resico' && Number(subtotal) > 0 ? invoiceFromSubtotal(Number(subtotal), withIva ?? !!profile?.chargesIva, company) : null;
  const buildIncomeTax = (n: number): IncomeTax | undefined => {
    if (kind !== 'income') return undefined;
    if (effTaxKind === 'resico' && invoice) { const { deposit: _d, ...t } = invoice; return t; }
    if (effTaxKind === 'resico') return { kind: 'resico', subtotal: n, ivaCharged: 0, isrWithheld: 0, ivaWithheld: 0, clientIsCompany: false };
    if (effTaxKind === 'salary') { const gross = Number(subtotal) || n; return { kind: 'salary', subtotal: gross, ivaCharged: 0, isrWithheld: Math.max(0, gross - n), ivaWithheld: 0, clientIsCompany: true }; }
    return { kind: 'none', subtotal: n, ivaCharged: 0, isrWithheld: 0, ivaWithheld: 0, clientIsCompany: false };
  };

  const save = async () => {
    const n = invoice ? invoice.deposit : Math.abs(Number(amount));
    if (!n || !acc) return;
    const months = isCardExpense && msiValue ? Number(msiValue) : null;
    const incomeTax = buildIncomeTax(n);
    const ivaCreditable = kind === 'expense' && ivaExpense ? Math.round((n * IVA_RATE / (1 + IVA_RATE)) * 100) / 100 : undefined;
    if (tx) {
      if (kind === 'transfer' && (!to || to === acc)) return;
      await editTransaction(tx, { amount: n, date, description: desc || undefined, accountId: acc, toAccountId: to, category: cat || tx.category, areaId: areaId || undefined, msiMonths: months, incomeTax: incomeTax ?? null, ivaCreditable: ivaCreditable ?? 0 });
      onClose();
      return;
    }
    const base = { date, description: desc || undefined, createdAt: Date.now() };
    let incomeTx: Transaction | undefined;
    if (kind === 'transfer') {
      if (!to || to === acc) return;
      // A card payment counts toward its statement; a deposit into the shield or investments pays savings XP.
      await transfer(acc, to, n, date, base.description);
      await evaluateStatements(acc);
    } else {
      const id = uid();
      await db.transactions.add({ ...base, id, accountId: acc, amount: kind === 'income' ? n : -n, kind, category: cat || EXPENSE_CATEGORIES[0], areaId: areaId || undefined, incomeTax, ivaCreditable });
      if (kind === 'expense') await db.settings.put({ key: 'lastExpenseCategory', value: cat });
      await rewardTransactionLogged(id);
      if (months) await setInstallments((await db.transactions.get(id))!, months);
      if (accObj?.type === 'credit') await evaluateStatements(acc);
      if (kind === 'income') incomeTx = await db.transactions.get(id);
    }
    await checkAchievements();
    setAmount(''); setDesc(''); setMsi(null); setSubtotal(''); onClose();
    if (incomeTx && accObj?.type !== 'credit') onIncome?.(incomeTx);
  };

  return (
    <Modal open={open} onClose={onClose} title={tx ? 'Edit transaction' : preset?.kind === 'transfer' ? 'Pay card' : preset?.kind === 'income' ? 'Invoice paid: log the income' : 'New transaction'}>
      <div className="flex flex-col gap-3">
        {tx ? (
          <p className="font-type text-sm text-ink/70">{kind === 'transfer' ? 'Transfer / pay card' : <span className="capitalize">{kind}</span>} · to change the kind, delete it and log it again.</p>
        ) : (
          <div className="mac-inset grid grid-cols-3 gap-1 bg-white p-1">
            {(['expense', 'income', 'transfer'] as TxKind[]).map(k => <button key={k} onClick={() => setKind(k)} className={cx('min-h-[40px] py-2 text-sm font-semibold capitalize', kind === k ? 'mac-btn bg-xp text-ink' : 'text-ink/60')}>{k === 'transfer' ? 'Transfer / pay card' : k}</button>)}
          </div>
        )}
        {kind === 'income' && (
          <Label text="Tax"><Select value={effTaxKind} onChange={e => setTaxKind(e.target.value as IncomeTaxKind)}>
            <option value="resico">RESICO invoice (CFDI)</option><option value="salary">Salary (tax already withheld)</option><option value="none">No tax (refund, gift, transfer in)</option>
          </Select></Label>
        )}
        {kind === 'income' && effTaxKind === 'resico' && (
          <div className="mac-inset flex flex-col gap-2 bg-white p-2">
            <Label text="Invoice subtotal, before IVA"><Input inputMode="decimal" value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="0.00" className="text-lg font-bold" /></Label>
            <label className="flex min-h-[40px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={withIva ?? !!profile?.chargesIva} onChange={e => setWithIva(e.target.checked)} />Charges IVA (16 %)</label>
            <label className="flex min-h-[40px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={company} onChange={e => setCompany(e.target.checked)} />Client is a company (persona moral): withholds 1.25 % ISR and 2/3 of the IVA</label>
            {invoice && <p className="text-[12px] text-ink/70">IVA {mxn(invoice.ivaCharged, 2)} · ISR withheld {mxn(invoice.isrWithheld, 2)} · IVA withheld {mxn(invoice.ivaWithheld, 2)} → lands in the account: <b>{mxn(invoice.deposit, 2)}</b></p>}
            {!invoice && <p className="text-[12px] text-ink/60">Or leave the subtotal empty and type the amount received below (no IVA, no withholding).</p>}
          </div>
        )}
        {!invoice && <Label text={kind === 'income' && effTaxKind === 'salary' ? 'Amount received (net)' : 'Amount (MXN)'}><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="text-lg font-bold" /></Label>}
        {kind === 'income' && effTaxKind === 'salary' && <Label text="Gross salary (for the RESICO cap; optional)"><Input inputMode="decimal" value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="same as received" /></Label>}
        {kind === 'expense' && resico && <label className="flex min-h-[40px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={ivaExpense} onChange={e => setIvaExpense(e.target.checked)} />Business expense with CFDI (IVA creditable: {mxn((Math.abs(Number(amount)) || 0) * IVA_RATE / (1 + IVA_RATE), 2)})</label>}
        <Label text={kind === 'transfer' ? 'From' : kind === 'expense' ? 'Paid with' : 'Into'}>
          <Select value={acc} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        </Label>
        {kind === 'transfer' ? (
          <Label text="To (choose a credit card to register a payment)"><Select value={to} onChange={e => setToId(e.target.value)}>{accounts.filter(a => a.id !== acc).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Label text="Category"><Select value={cat} onChange={e => setCategory(e.target.value)}>{catOptions(kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c}>{c}</option>)}</Select></Label>
            {kind === 'income' && <Label text="Earned by"><Select value={areaId} onChange={e => setAreaId(e.target.value)}><option value="">—</option>{areas.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}</Select></Label>}
            {kind === 'expense' && <Label text="Cost of (real MXN/h)"><Select value={areaId} onChange={e => setAreaId(e.target.value)}><option value="">Personal</option><option value={SHARED_WORK_AREA}>Shared work cost</option>{allAreas.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}</Select></Label>}
            {isCardExpense && <Label text="Meses sin intereses"><Select value={msiValue} onChange={e => setMsi(e.target.value)}><option value="">No (one payment)</option>{MSI_MONTHS.map(m => <option key={m} value={m}>{m} MSI · {mxn(Math.abs(Number(amount) || 0) / m, 2)}/mo</option>)}</Select></Label>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Label text="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Label>
          <Label text="Note"><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" /></Label>
        </div>
        <Button variant="gold" onClick={save}>{tx ? 'Save changes' : `Save · +${FINANCE_XP.logTransaction} XP`}</Button>
      </div>
    </Modal>
  );
}

function AccountForm({ acc, onClose }: { acc: Account; onClose: () => void }) {
  const [f, setF] = useState(acc);
  // Money fields are edited as text and parsed on save: parsing on every keystroke ate the "." in "1234." and a lone "-".
  const [opening, setOpening] = useState(String(acc.openingBalance ?? 0));
  const [limit, setLimit] = useState(acc.creditLimit == null ? '' : String(acc.creditLimit));
  const [err, setErr] = useState('');
  const num = (s: string) => (s === '' ? undefined : Number(s));
  const money = (s: string) => Number(s.replace(/[,$\s]/g, ''));
  const save = async () => {
    const ob = opening.trim() === '' ? 0 : money(opening);
    const lim = limit.trim() === '' ? undefined : money(limit);
    if (Number.isNaN(ob) || (lim !== undefined && Number.isNaN(lim))) { setErr('Type amounts as numbers, e.g. -2381.50'); return; }
    const next = { ...f, openingBalance: ob, ...(f.type === 'credit' ? { creditLimit: lim } : {}) };
    await db.accounts.put(next); await evaluateStatements(next.id); onClose();
  };
  const bank: BankKey = f.bank ?? 'other';
  return (
    <Modal open onClose={onClose} title={`Edit ${acc.name}`}>
      <div className="flex flex-col gap-3">
        <Label text="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Label>
        {f.type !== 'credit' && (
          <Label text="Bucket (what this money is for)"><Select value={f.role ?? ''} onChange={e => setF({ ...f, role: (e.target.value || undefined) as AccountRole | undefined })}>
            <option value="">—</option>
            {(Object.keys(ROLE_LABEL) as AccountRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select></Label>
        )}
        <Label text={f.type === 'credit' ? 'Current balance when you start (debt as negative, e.g. -4500)' : 'Opening balance'}><Input inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} /></Label>
        {f.type === 'credit' && (<>
          <Label text="Bank"><Select value={bank} onChange={e => { const b = e.target.value as BankKey; setF({ ...f, bank: b, institution: b === 'other' ? f.institution : BANKS[b].name, dueDaysAfterCutoff: BANKS[b].dueDaysAfterCutoff ?? f.dueDaysAfterCutoff }); }}>
            {(Object.keys(BANKS) as BankKey[]).map(k => <option key={k} value={k}>{BANKS[k].name}</option>)}
          </Select></Label>
          <p className="text-xs text-ink/60">{BANKS[bank].note}</p>
          <div className="grid grid-cols-3 gap-3">
            <Label text="Limit"><Input inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} /></Label>
            <Label text="Cut-off day"><Input inputMode="numeric" value={f.cutoffDay ?? ''} onChange={e => setF({ ...f, cutoffDay: num(e.target.value) })} /></Label>
            <Label text="Due (days after)"><Input inputMode="numeric" value={f.dueDaysAfterCutoff ?? dueDaysFor(f)} disabled={bank !== 'other'} onChange={e => setF({ ...f, dueDaysAfterCutoff: num(e.target.value) })} /></Label>
          </div>
        </>)}
        {err && <p role="alert" className="text-sm text-hp">{err}</p>}
        <Button onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

/** The income engine's leading indicators: one tap per conversation, proposal or case study, plus the leads. */
function PipelineCard({ opps, onEdit }: { opps: Opportunity[]; onEdit: (o: Opportunity | 'new') => void }) {
  const toast = useToast();
  const monday = weekStartKey(dateKey());
  const week = useLiveQuery(() => db.pipelineEvents.where('date').aboveOrEqual(monday).toArray(), [monday], []);
  const count = (k: PipelineEventKind) => week.filter(e => e.kind === k).length;
  const pipe = pipelineValue(opps);
  const last = [...week].filter(e => e.kind !== 'stage').sort((a, b) => b.createdAt - a.createdAt)[0];
  // The site is the plan's distribution hub: proof goes up every two weeks (00-MASTER-PLAN.md §6).
  const lastCase = useLiveQuery(async () => (await db.pipelineEvents.where('kind').equals('case-study').toArray()).map(e => e.date).sort().pop() ?? null, [week.length]);
  const caseDays = lastCase ? Math.round((parseKey(dateKey()).getTime() - parseKey(lastCase).getTime()) / 864e5) : null;
  const log = async (k: Exclude<PipelineEventKind, 'stage'>) => { await logPipelineEvent(k); };
  return (
    <Card title="Opportunity Pipeline" action={<Button variant="ghost" className="!px-3" onClick={() => onEdit('new')}><Glyph name="plus" size={16}/>Add lead</Button>}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {([['conversation', 'Conversation'], ['proposal', 'Proposal'], ['case-study', 'Case study']] as const).map(([k, label]) => (
          <Button key={k} variant="cyan" className="!px-2 text-sm" onClick={() => log(k)}><Glyph name="plus" size={14}/>{label} · {LEAD_XP[k]}</Button>
        ))}
      </div>
      <p className="mb-1 text-xs text-ink/70">This week: <b className={cx(count('conversation') >= WEEKLY_CONVERSATIONS && 'text-ok')}>{count('conversation')}/{WEEKLY_CONVERSATIONS} conversations</b> · {count('proposal')} proposals · {count('case-study')} case studies</p>
      {lastCase !== undefined && <p className={cx('mb-1 text-xs', caseDays === null || caseDays > 14 ? 'text-gold' : 'text-ink/70')}>{caseDays === null ? 'No case study on your site yet. The plan: one every two weeks.' : `Last case study on your site: ${caseDays === 0 ? 'today' : `${caseDays} day${caseDays === 1 ? '' : 's'} ago`}${caseDays > 14 ? '. The plan: one every two weeks.' : '.'}`}</p>}
      {last && <p className="mb-2 flex items-center gap-2 text-[11px] text-ink/55">Last: {last.kind} · {last.date.slice(5)}<button className="-my-2 min-h-[40px] px-2 underline" onClick={async () => { await deletePipelineEvent(last.id); toast('Removed the last entry', 'bad'); }}>undo</button></p>}
      <p className="mb-3 text-xs text-ink/60">Expected: <b className="text-gold">{mxn(pipe.expectedMonthly)}/mo</b> · best case {mxn(pipe.bestCaseMonthly)}/mo · won {mxn(pipe.wonMonthly)}/mo</p>
      <div className="flex flex-col gap-2">
        {[...opps].sort((a, b) => (a.nextActionDate ?? a.expectedDate ?? 'z').localeCompare(b.nextActionDate ?? b.expectedDate ?? 'z')).map(o => (
          <button key={o.id} onClick={() => onEdit(o)} className={cx('mac-window p-3 text-left hover:bg-panel2', isStale(o) ? 'bg-pink/30' : 'bg-panel2/60')}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{o.title}</span><span className="flex gap-1">{o.kind && <Chip color="#e5d6a1">{o.kind}</Chip>}<Chip color={{ lead: '#d4d9d6', applied: '#b9cfe0', interview: '#c7c2e3', won: '#a6d9d1', lost: '#a8383a' }[o.status]}>{o.status}</Chip></span></div>
            <div className="mt-1 text-[11px] text-ink/60">{mxn(o.monthlyValue)}/mo · {Math.round(o.probability * 100)}% {o.expectedDate && `· ${o.expectedDate}`}</div>
            {o.nextAction && <div className={cx('mt-1 text-xs', isStale(o) ? 'text-hp' : 'text-ink/80')}>→ {o.nextAction}{o.nextActionDate && ` · by ${o.nextActionDate.slice(5)}`}{isStale(o) && ' · overdue'}</div>}
          </button>
        ))}
      </div>
    </Card>
  );
}

function OppForm({ opp, onClose }: { opp?: Opportunity; onClose: () => void }) {
  const [f, setF] = useState<Opportunity>(opp ?? { id: uid(), title: '', status: 'lead', monthlyValue: 0, probability: 0.3, createdAt: Date.now() });
  const [monthly, setMonthly] = useState(String(opp?.monthlyValue ?? 0));
  return (
    <Modal open onClose={onClose} title={opp ? 'Edit opportunity' : 'New opportunity'}>
      <div className="flex flex-col gap-3">
        <Label text="Title"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Status"><Select value={f.status} onChange={e => setF({ ...f, status: e.target.value as OpportunityStatus })}>{['lead', 'applied', 'interview', 'won', 'lost'].map(s => <option key={s}>{s}</option>)}</Select></Label>
          <Label text="Kind"><Select value={f.kind ?? ''} onChange={e => setF({ ...f, kind: (e.target.value || undefined) as OpportunityKind | undefined })}><option value="">—</option><option value="job">Job</option><option value="project">Project</option><option value="retainer">Retainer (monthly)</option></Select></Label>
          <Label text="Monthly value (MXN)"><Input inputMode="decimal" value={monthly} onChange={e => setMonthly(e.target.value)} /></Label>
          <Label text={`Probability: ${Math.round(f.probability * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={f.probability} onChange={e => setF({ ...f, probability: Number(e.target.value) })} className="mt-3 min-h-[40px] accent-pink-500" /></Label>
          <Label text="Expected date"><Input type="date" value={f.expectedDate ?? ''} onChange={e => setF({ ...f, expectedDate: e.target.value || undefined })} /></Label>
          <Label text="Next action by"><Input type="date" value={f.nextActionDate ?? ''} onChange={e => setF({ ...f, nextActionDate: e.target.value || undefined })} /></Label>
        </div>
        <Label text="Next action"><Input value={f.nextAction ?? ''} onChange={e => setF({ ...f, nextAction: e.target.value })} /></Label>
        <Label text="Notes"><textarea rows={3} value={f.notes ?? ''} onChange={e => setF({ ...f, notes: e.target.value })} className="mac-inset w-full bg-white p-3 text-sm outline-none" /></Label>
        <p className="text-xs text-ink/60">Moving a lead to a new stage pays +{LEAD_XP.stage} XP once per stage. Winning a job or a retainer unlocks Steady Income.</p>
        <div className="flex gap-2">
          {opp && <Button variant="danger" aria-label="Delete opportunity" onClick={async () => { if (confirm('Delete this opportunity?')) { await deleteOpportunity(f); onClose(); } }}><Glyph name="trash" size={16}/></Button>}
          <Button className="flex-1" onClick={async () => { if (!f.title.trim()) return; await saveOpportunity({ ...f, monthlyValue: Number(monthly.replace(/[,$\s]/g, '')) || 0 }); onClose(); }}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
