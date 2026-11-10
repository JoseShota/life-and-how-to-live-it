// Treasury tools: importing a bank statement (P5-1, CSV) and the invoices you are owed (P5-7).
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Invoice } from '@/db/types';
import { candidatesFromCsv, type Candidate } from '@/finance/importCsv';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/finance/finance';
import { importTransactions } from '@/game/engine';
import { useToast } from '@/lib/toast';
import { cx, dateKey, mxn, uid } from '@/lib/util';
import { Glyph } from './Glyph';
import { Button, Card, Input, Label, Modal, Select } from './ui';

/** Pick an account and a CSV file from the bank; see every row; choose what goes into the ledger. */
export function ImportSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  const txs = useLiveQuery(() => db.transactions.toArray(), [], []);
  const [accountId, setAccountId] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [flip, setFlip] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [cats, setCats] = useState<Record<number, string>>({});
  const acc = accounts.find(a => a.id === accountId) ?? accounts[0];
  // On a card, a single amount column usually lists purchases as positive numbers.
  const chargesPositive = flip ?? acc?.type === 'credit';
  const res = text !== null && acc ? candidatesFromCsv(text, { account: acc, existing: txs, chargesPositive }) : null;
  // Out by default: what is already logged, and payments into a card (those are transfers from another account).
  const on = (c: Candidate) => picked[c.line] ?? (!c.duplicate && !c.cardPayment);
  const chosen = res?.candidates.filter(on) ?? [];
  const read = async (f?: File) => { if (f) { setText(await f.text()); setPicked({}); setCats({}); } };
  const save = async () => {
    if (!acc || !chosen.length) return;
    const n = await importTransactions(acc.id, chosen.map(c => ({ date: c.date, amount: c.amount, description: c.description, category: cats[c.line] ?? c.category })));
    toast(`${n} transaction${n === 1 ? '' : 's'} imported`, 'gold');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Import a statement (CSV)">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink/70">Download the movements from your bank as CSV (or save the Excel file as CSV) and choose it here. The file is read on this device; nothing is uploaded.</p>
        <Label text="Account"><Select value={acc?.id ?? ''} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Label>
        <Label text="File"><input type="file" accept=".csv,.txt,text/csv,text/plain" className="mac-inset min-h-[40px] w-full bg-white p-2 text-sm" onChange={e => read(e.target.files?.[0])} /></Label>
        {res?.error && <p role="alert" className="font-type text-sm text-hp">{res.error}</p>}
        {res && !res.error && (<>
          <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={chargesPositive} onChange={e => setFlip(e.target.checked)} />
            In this file, purchases are positive numbers
          </label>
          <p className="text-xs text-ink/70">{res.candidates.length} movement{res.candidates.length === 1 ? '' : 's'} read{res.skipped ? `, ${res.skipped} line${res.skipped === 1 ? '' : 's'} without a date or an amount left out` : ''}. Check the signs: money out is negative.</p>
          <ul className="max-h-[42vh] divide-y divide-line overflow-y-auto border-2 border-line">
            {res.candidates.map(c => (
              <li key={c.line} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 text-sm', !on(c) && 'bg-panel2/70 text-ink/50')}>
                <label className="flex min-h-[40px] min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={on(c)} onChange={e => setPicked({ ...picked, [c.line]: e.target.checked })} />
                  <span className="w-11 shrink-0 text-[11px]">{c.date.slice(5)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.description || '(no description)'}{c.duplicate && <b className="text-gold"> · already logged</b>}{c.cardPayment && <b className="text-gold"> · card payment: log it as a transfer</b>}</span>
                  <span className={cx('shrink-0 font-semibold', c.amount > 0 && 'text-ok')}>{mxn(c.amount, 2)}</span>
                </label>
                {on(c) && <Select aria-label={`Category for ${c.description}`} className="!w-40" value={cats[c.line] ?? c.category} onChange={e => setCats({ ...cats, [c.line]: e.target.value })}>{(c.amount < 0 ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map(k => <option key={k}>{k}</option>)}</Select>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink/60">Imported rows pay no XP (the +2 is for logging as you go). Income from an invoice with taxes is better logged by hand, so its tax fields are right.</p>
          <Button disabled={!chosen.length} onClick={save}>Import {chosen.length} into {acc?.name}</Button>
        </>)}
      </div>
    </Modal>
  );
}

/** Money you are owed for work. Marking one paid opens the income form, so the deposit and its taxes are logged once. */
export function InvoicesCard({ onPaid }: { onPaid: (inv: Invoice) => void }) {
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived && a.monetizable).toArray(), [], []);
  const [editing, setEditing] = useState<Invoice | 'new' | null>(null);
  const today = dateKey();
  const open = invoices.filter(i => !i.paidDate).sort((a, b) => (a.dueDate ?? a.issuedDate).localeCompare(b.dueDate ?? b.issuedDate));
  const paid = invoices.filter(i => i.paidDate).sort((a, b) => b.paidDate!.localeCompare(a.paidDate!));
  const owed = open.reduce((s, i) => s + i.amount, 0);
  const row = (i: Invoice) => {
    const late = !i.paidDate && !!i.dueDate && i.dueDate < today;
    return (
      <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate font-medium">{i.client}{i.concept ? ` · ${i.concept}` : ''}</div>
          <div className={cx('text-[11px]', late ? 'text-hp' : 'text-ink/60')}>
            {areas.find(a => a.id === i.areaId)?.short ?? 'no area'} · sent {i.issuedDate.slice(5)}{i.paidDate ? ` · paid ${i.paidDate.slice(5)}` : i.dueDate ? ` · ${late ? 'was due' : 'due'} ${i.dueDate.slice(5)}` : ''}
          </div>
        </div>
        <span className="shrink-0 font-semibold">{mxn(i.amount, 2)}</span>
        {!i.paidDate && <Button variant="gold" className="!px-3" onClick={() => onPaid(i)}>Paid</Button>}
        <button onClick={() => setEditing(i)} className="flex h-10 w-10 shrink-0 items-center justify-center text-ink/45 hover:text-xp" aria-label={`Edit invoice: ${i.client}`}><Glyph name="pencil" size={16} /></button>
      </li>
    );
  };
  return (
    <Card id="Invoices" title={`Invoices · ${mxn(owed)} owed to you`} action={<Button variant="ghost" className="!px-3" onClick={() => setEditing('new')}><Glyph name="plus" size={16} />Invoice</Button>}>
      {open.length === 0 ? <p className="text-sm text-ink/70">Nobody owes you money right now. Add an invoice when you send one, and it stays here until it is paid.</p>
        : <ul className="divide-y divide-line">{open.map(row)}</ul>}
      {paid.length > 0 && (
        <details className="mt-2">
          <summary className="flex min-h-[40px] cursor-pointer items-center font-display text-[13px] text-lav">Paid ({paid.length})</summary>
          <ul className="divide-y divide-line">{paid.slice(0, 20).map(row)}</ul>
        </details>
      )}
      {editing && <InvoiceForm inv={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function InvoiceForm({ inv, onClose }: { inv?: Invoice; onClose: () => void }) {
  const areas = useLiveQuery(() => db.areas.orderBy('order').filter(a => !a.archived && a.monetizable).toArray(), [], []);
  const [f, setF] = useState({ client: inv?.client ?? '', concept: inv?.concept ?? '', amount: inv ? String(inv.amount) : '', areaId: inv?.areaId ?? '', issuedDate: inv?.issuedDate ?? dateKey(), dueDate: inv?.dueDate ?? '' });
  const amount = Math.round(Number(f.amount.replace(/,/g, '')) * 100) / 100;
  const ok = !!f.client.trim() && amount > 0 && !!f.issuedDate;
  const save = async () => {
    if (!ok) return;
    const row = { client: f.client.trim(), concept: f.concept.trim() || undefined, amount, areaId: f.areaId || undefined, issuedDate: f.issuedDate, dueDate: f.dueDate || undefined };
    if (inv) await db.invoices.update(inv.id, row);
    else await db.invoices.add({ ...row, id: uid(), createdAt: Date.now() });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={inv ? 'Edit invoice' : 'New invoice'}>
      <div className="flex flex-col gap-3">
        <Label text="Client"><Input value={f.client} onChange={e => setF({ ...f, client: e.target.value })} placeholder="who owes you" /></Label>
        <Label text="For (optional)"><Input value={f.concept} onChange={e => setF({ ...f, concept: e.target.value })} placeholder="e.g. landing page, November" /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Amount you expect to receive"><Input inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Label>
          <Label text="Area"><Select value={f.areaId} onChange={e => setF({ ...f, areaId: e.target.value })}><option value="">—</option>{areas.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}</Select></Label>
          <Label text="Sent on"><Input type="date" value={f.issuedDate} onChange={e => setF({ ...f, issuedDate: e.target.value })} /></Label>
          <Label text="Due (optional)"><Input type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} /></Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" disabled={!ok} onClick={save}>{inv ? 'Save' : 'Add invoice'}</Button>
          {inv?.paidDate && <Button variant="ghost" onClick={async () => { await db.invoices.update(inv.id, { paidDate: undefined, txId: undefined }); onClose(); }}>Mark unpaid</Button>}
          {inv && <Button variant="danger" aria-label="Delete invoice" onClick={async () => { if (!confirm(`Delete the invoice for ${inv.client}? A logged income stays in the ledger.`)) return; await db.invoices.delete(inv.id); onClose(); }}><Glyph name="trash" size={16} /></Button>}
        </div>
      </div>
    </Modal>
  );
}
