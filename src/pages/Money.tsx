import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { subDays } from 'date-fns';
import { db } from '@/db/db';
import type { Account, Goal, Opportunity, OpportunityStatus, TxKind } from '@/db/types';
import { balanceOf, cardStatus, monthTotals, expenseByCategory, hourlyRates, pipelineValue, netWorth, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/finance/finance';
import { award, revoke, rewardTransactionLogged } from '@/game/engine';
import { checkAchievements } from '@/game/achievements';
import { FINANCE_XP } from '@/game/rules';
import { cx, dateKey, mxn, uid } from '@/lib/util';
import { Bar, Button, Card, Chip, Empty, Input, Label, Modal, Select, PageTitle } from '@/components/ui';

const PIE = ['#e3b9b2', '#a6d9d1', '#c7c2e3', '#b9cfe0', '#dccb98', '#e8c9a0', '#bcd3c6', '#a8383a', '#d4d9d6'];

export default function Money() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const txs = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], []);
  const goals = useLiveQuery(() => db.goals.orderBy('order').toArray(), [], []);
  const opps = useLiveQuery(() => db.opportunities.toArray(), [], []);
  const [txOpen, setTxOpen] = useState(false);
  const [editAcc, setEditAcc] = useState<Account | null>(null);
  const [editOpp, setEditOpp] = useState<Opportunity | 'new' | null>(null);

  const month = monthTotals(txs);
  const cats = expenseByCategory(txs);
  const nw = netWorth(accounts, txs);
  const since = dateKey(subDays(new Date(), 90));
  const rates = useMemo(() => hourlyRates(areas.filter(a => a.monetizable), txs, sessions, since), [areas, txs, sessions, since]);
  const pipe = pipelineValue(opps);
  const debt = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + Math.max(0, -balanceOf(a, txs)), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="宝庫" sub="banorte ×4, cash, and the long road to the first million" right={<Button variant="gold" onClick={() => setTxOpen(true)}><Glyph name="plus" size={16}/>Transaction</Button>}>Treasury</PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net worth" value={mxn(nw)} tone={nw >= 0 ? 'text-ok' : 'text-hp'} />
        <Stat label="Card debt" value={mxn(debt)} tone={debt > 0 ? 'text-hp' : 'text-ok'} />
        <Stat label="Income · this month" value={mxn(month.income)} />
        <Stat label="Savings rate" value={`${Math.round(month.savingsRate * 100)}%`} tone={month.savingsRate >= 0.3 ? 'text-ok' : month.savingsRate > 0 ? 'text-gold' : 'text-hp'} sub={`Spent ${mxn(month.expense)}`} />
      </div>

      <Card title="Accounts">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map(a => {
            const bal = balanceOf(a, txs);
            const c = a.type === 'credit' ? cardStatus(a, txs) : null;
            return (
              <div key={a.id} className="mac-window p-3" style={{ background: `linear-gradient(135deg, ${a.color}66, #ffffff 75%)` }}>
                <div className="flex items-start justify-between">
                  <div><div className="text-sm font-semibold">{a.name}</div><div className="text-[11px] uppercase tracking-wider text-ink/60">{a.type}</div></div>
                  <button onClick={() => setEditAcc(a)} className="p-1 text-ink/60 hover:text-xp" aria-label="Edit account"><Glyph name="pencil" size={14}/></button>
                </div>
                <div className={cx('mt-2 font-display text-3xl leading-8', bal < 0 ? 'text-hp' : 'text-ok')}>{mxn(bal, 2)}</div>
                {c && (
                  <div className="mt-2 space-y-1 text-[11px] text-ink/60">
                    {a.creditLimit ? <><Bar value={c.utilization} color={c.utilization > 0.3 ? '#a8383a' : '#a6d9d1'} height="h-3" /><div>{Math.round(c.utilization * 100)}% used · keep &lt;30%</div></> : <div className="text-gold">Set limit, cut-off & due day →</div>}
                    {c.nextCutoff && <div>Corte: {c.nextCutoff.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · Pago: {c.nextDue?.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} <b className={cx(c.daysToDue! <= 5 && c.debt > 0 && 'text-hp')}>({c.daysToDue}d)</b></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="The Wealth Engine · MXN per hour, 90 days">
          {rates.every(r => r.income === 0) ? <Empty>Log income with its activity (e.g. “Freelance”) and track focus time. This table will rank which activity pays most per hour — that is where your next hour goes.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-ink/55"><th className="py-1">Activity</th><th>Income</th><th>Hours</th><th className="text-right">MXN/h</th></tr></thead>
              <tbody>{rates.map(r => (
                <tr key={r.area.id} className="border-t border-line"><td className="py-2"><span className="inline-flex items-center gap-1.5"><Glyph name={r.area.icon} size={16} />{r.area.short}</span></td><td>{mxn(r.income)}</td><td>{r.hours.toFixed(1)}</td><td className="text-right font-bold text-gold">{r.rate ? mxn(r.rate) : '—'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>

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

        <Card title="Opportunity Pipeline" action={<Button variant="ghost" className="!min-h-[34px] !px-3" onClick={() => setEditOpp('new')}><Glyph name="plus" size={16}/>Add</Button>}>
          <p className="mb-3 text-xs text-ink/60">Expected: <b className="text-gold">{mxn(pipe.expectedMonthly)}/mo</b> · best case {mxn(pipe.bestCaseMonthly)}/mo · won {mxn(pipe.wonMonthly)}/mo</p>
          <div className="flex flex-col gap-2">
            {opps.sort((a, b) => (a.expectedDate ?? 'z').localeCompare(b.expectedDate ?? 'z')).map(o => (
              <button key={o.id} onClick={() => setEditOpp(o)} className="mac-window bg-panel2/60 p-3 text-left hover:bg-panel2">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{o.title}</span><Chip color={{ lead: '#d4d9d6', applied: '#b9cfe0', interview: '#c7c2e3', won: '#a6d9d1', lost: '#a8383a' }[o.status]}>{o.status}</Chip></div>
                <div className="mt-1 text-[11px] text-ink/60">{mxn(o.monthlyValue)}/mo · {Math.round(o.probability * 100)}% {o.expectedDate && `· ${o.expectedDate}`}</div>
                {o.nextAction && <div className="mt-1 text-xs text-ink/80">→ {o.nextAction}</div>}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Wealth Goals">
          <div className="flex flex-col gap-3">{goals.map(g => <GoalRow key={g.id} g={g} />)}</div>
        </Card>
      </div>

      <Card title="The Ledger">
        {txs.length === 0 ? <Empty>Log every peso for 30 days — it unlocks “Bookkeeper” and gives the wealth engine real data.</Empty> : (
          <ul className="divide-y divide-line">
            {txs.slice(0, 30).map(t => {
              const acc = accounts.find(a => a.id === t.accountId);
              const area = areas.find(a => a.id === t.areaId);
              return (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-12 shrink-0 text-[11px] text-ink/55">{t.date.slice(5)}</span>
                  <div className="min-w-0 flex-1"><div className="truncate">{t.description || t.category}</div><div className="text-[11px] text-ink/55">{acc?.name} · {t.category}{area ? ` · ${area.short}` : ''}</div></div>
                  <span className={cx('shrink-0 font-semibold', t.amount >= 0 ? 'text-ok' : 'text-ink/90')}>{mxn(t.amount, 2)}</span>
                  <button className="p-1 text-ink/40 hover:text-hp" aria-label="Delete transaction" onClick={async () => {
                    if (!confirm('Delete transaction?')) return;
                    if (t.transferId) await db.transactions.where('transferId').equals(t.transferId).delete(); else await db.transactions.delete(t.id);
                    await revoke(`tx:${t.id}`);
                  }}><Glyph name="trash" size={14}/></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <TxForm open={txOpen} onClose={() => setTxOpen(false)} />
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
        <Input className="!min-h-[32px] text-xs" placeholder={g.target === 1 ? '1 = done' : 'Update current amount'} inputMode="decimal" value={v} onChange={e => setV(e.target.value)} />
        <Button variant="ghost" className="!min-h-[32px] !px-3 text-xs" onClick={async () => {
          const n = Number(v); if (Number.isNaN(n) || v === '') return;
          const before = g.current;
          await db.goals.update(g.id, { current: n });
          if (n > before) await award('finance', `goal:${g.id}:${Date.now()}`, FINANCE_XP.saveDeposit, `Progress: ${g.name}`);
          setV('');
        }}>Update</Button>
      </div>
    </div>
  );
}

function TxForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => a.monetizable && !a.archived).toArray(), [], []);
  const [kind, setKind] = useState<TxKind>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toId, setToId] = useState('');
  const [category, setCategory] = useState('');
  const [areaId, setAreaId] = useState('');
  const [date, setDate] = useState(dateKey());
  const [desc, setDesc] = useState('');
  const acc = accountId || accounts[0]?.id;
  const to = toId || accounts.find(a => a.id !== acc)?.id;

  const save = async () => {
    const n = Math.abs(Number(amount));
    if (!n || !acc) return;
    const base = { date, description: desc || undefined, createdAt: Date.now() };
    if (kind === 'transfer') {
      if (!to || to === acc) return;
      const tid = uid();
      const toAcc = await db.accounts.get(to);
      const isCardPayment = toAcc?.type === 'credit';
      const id1 = uid();
      await db.transactions.bulkAdd([
        { ...base, id: id1, accountId: acc, amount: -n, kind: 'transfer', category: isCardPayment ? 'Card payment' : 'Transfer', transferId: tid },
        { ...base, id: uid(), accountId: to, amount: n, kind: 'transfer', category: isCardPayment ? 'Card payment' : 'Transfer', transferId: tid }
      ]);
      if (isCardPayment && toAcc) {
        const txs = await db.transactions.where('accountId').equals(to).toArray();
        if (balanceOf(toAcc, txs) >= 0) await award('finance', `tx:${id1}`, FINANCE_XP.payCardInFull, `Paid ${toAcc.name} in full`);
        else await rewardTransactionLogged(id1);
      } else await rewardTransactionLogged(id1);
    } else {
      const id = uid();
      await db.transactions.add({ ...base, id, accountId: acc, amount: kind === 'income' ? n : -n, kind, category: category || (kind === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]), areaId: kind === 'income' ? (areaId || undefined) : undefined });
      await rewardTransactionLogged(id);
    }
    await checkAchievements();
    setAmount(''); setDesc(''); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New transaction">
      <div className="flex flex-col gap-3">
        <div className="mac-inset grid grid-cols-3 gap-1 bg-white p-1">
          {(['expense', 'income', 'transfer'] as TxKind[]).map(k => <button key={k} onClick={() => setKind(k)} className={cx('py-2 text-sm font-semibold capitalize', kind === k ? 'mac-btn bg-xp text-ink' : 'text-ink/60')}>{k === 'transfer' ? 'Transfer / pay card' : k}</button>)}
        </div>
        <Label text="Amount (MXN)"><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="text-lg font-bold" /></Label>
        <Label text={kind === 'transfer' ? 'From' : kind === 'expense' ? 'Paid with' : 'Into'}>
          <Select value={acc} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        </Label>
        {kind === 'transfer' ? (
          <Label text="To (choose a credit card to register a payment)"><Select value={to} onChange={e => setToId(e.target.value)}>{accounts.filter(a => a.id !== acc).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Label text="Category"><Select value={category} onChange={e => setCategory(e.target.value)}>{(kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c}>{c}</option>)}</Select></Label>
            {kind === 'income' && <Label text="Earned by"><Select value={areaId} onChange={e => setAreaId(e.target.value)}><option value="">—</option>{areas.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}</Select></Label>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Label text="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Label>
          <Label text="Note"><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional" /></Label>
        </div>
        <Button variant="gold" onClick={save}>Save · +{FINANCE_XP.logTransaction} XP</Button>
      </div>
    </Modal>
  );
}

function AccountForm({ acc, onClose }: { acc: Account; onClose: () => void }) {
  const [f, setF] = useState(acc);
  const num = (s: string) => (s === '' ? undefined : Number(s));
  return (
    <Modal open onClose={onClose} title={`Edit ${acc.name}`}>
      <div className="flex flex-col gap-3">
        <Label text="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Label>
        <Label text={f.type === 'credit' ? 'Current balance when you start (debt as negative, e.g. -4500)' : 'Opening balance'}><Input inputMode="decimal" value={f.openingBalance} onChange={e => setF({ ...f, openingBalance: Number(e.target.value) || 0 })} /></Label>
        {f.type === 'credit' && (
          <div className="grid grid-cols-3 gap-3">
            <Label text="Limit"><Input inputMode="decimal" value={f.creditLimit ?? ''} onChange={e => setF({ ...f, creditLimit: num(e.target.value) })} /></Label>
            <Label text="Cut-off day"><Input inputMode="numeric" value={f.cutoffDay ?? ''} onChange={e => setF({ ...f, cutoffDay: num(e.target.value) })} /></Label>
            <Label text="Pay-by day"><Input inputMode="numeric" value={f.paymentDueDay ?? ''} onChange={e => setF({ ...f, paymentDueDay: num(e.target.value) })} /></Label>
          </div>
        )}
        <Button onClick={async () => { await db.accounts.put(f); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}

function OppForm({ opp, onClose }: { opp?: Opportunity; onClose: () => void }) {
  const [f, setF] = useState<Opportunity>(opp ?? { id: uid(), title: '', status: 'lead', monthlyValue: 0, probability: 0.3, createdAt: Date.now() });
  return (
    <Modal open onClose={onClose} title={opp ? 'Edit opportunity' : 'New opportunity'}>
      <div className="flex flex-col gap-3">
        <Label text="Title"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Status"><Select value={f.status} onChange={e => setF({ ...f, status: e.target.value as OpportunityStatus })}>{['lead', 'applied', 'interview', 'won', 'lost'].map(s => <option key={s}>{s}</option>)}</Select></Label>
          <Label text="Expected date"><Input type="date" value={f.expectedDate ?? ''} onChange={e => setF({ ...f, expectedDate: e.target.value || undefined })} /></Label>
          <Label text="Monthly value (MXN)"><Input inputMode="decimal" value={f.monthlyValue} onChange={e => setF({ ...f, monthlyValue: Number(e.target.value) || 0 })} /></Label>
          <Label text={`Probability: ${Math.round(f.probability * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={f.probability} onChange={e => setF({ ...f, probability: Number(e.target.value) })} className="mt-3 accent-pink-500" /></Label>
        </div>
        <Label text="Next action"><Input value={f.nextAction ?? ''} onChange={e => setF({ ...f, nextAction: e.target.value })} /></Label>
        <Label text="Notes"><textarea rows={3} value={f.notes ?? ''} onChange={e => setF({ ...f, notes: e.target.value })} className="mac-inset w-full bg-white p-3 text-sm outline-none" /></Label>
        <div className="flex gap-2">
          {opp && <Button variant="danger" onClick={async () => { await db.opportunities.delete(f.id); onClose(); }}><Glyph name="trash" size={16}/></Button>}
          <Button className="flex-1" onClick={async () => { if (!f.title.trim()) return; await db.opportunities.put(f); onClose(); }}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
