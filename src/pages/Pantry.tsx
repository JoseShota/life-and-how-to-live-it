import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { Button, Card, Chip, Empty, Input, Label, Modal, PageTitle, Select } from '@/components/ui';
import { db } from '@/db/db';
import type { GroceryItem, GrocerySection, GroceryTrip } from '@/db/types';
import { useToday } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { cx, mxn, parseKey } from '@/lib/util';
import {
  GROCERY_NAME_MAX, GROCERY_SECTIONS, agoText, byAisle, daysBetween, guessSection, itemKey, parseGroceryInput,
  restock, runningLow, sectionLabel, tripStats, usuals
} from '@/lib/groceries';
import { GROCERY_CATEGORY, addToList, deleteTrip, finishTrip, forgetItem, relist, saveItem, toggleCart, unlist } from '@/lib/pantryStore';

const dayText = (k: string) => parseKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const USUALS_SHOWN = 18;
/** "1,234.50", "$780", "780,5" → a number; anything else → NaN. */
const parseMoney = (v: string) => Number(v.replace(/[$\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));

export default function Pantry() {
  const today = useToday();
  const toast = useToast();
  const items = useLiveQuery(() => db.groceries.toArray(), [], []);
  const trips = useLiveQuery(() => db.groceryTrips.orderBy('date').reverse().toArray(), [], []);
  const [editing, setEditing] = useState<GroceryItem | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [allUsuals, setAllUsuals] = useState(false);

  const list = items.filter(i => i.needed);
  const cart = list.filter(i => i.inCart);
  const stats = useMemo(() => tripStats(trips, today), [trips, today]);
  const low = useMemo(() => runningLow(items, today, stats.every), [items, today, stats.every]);
  const lowIds = new Set(low.map(l => l.item.id));
  const usual = usuals(items).filter(i => !lowIds.has(i.id));
  // Bought once: remembered too, after the usuals.
  const once = items.filter(i => !i.needed && !lowIds.has(i.id) && i.bought.length < 2).sort((a, b) => (b.bought.at(-1) ?? '').localeCompare(a.bought.at(-1) ?? ''));
  const remembered = [...usual, ...once];

  const sub = stats.last
    ? `last trip ${agoText(stats.since ?? 0)}${list.length ? ` · ${list.length} to buy` : ''}.`
    : 'what to buy, and when you went.';

  return (
    <div className="flex flex-col gap-4">
      <PageTitle jp="食料庫" plain="groceries" sub={sub} right={
        <Button onClick={() => setFinishing(true)}><Glyph name="basket" size={18} />{cart.length ? `Finish trip · ${cart.length}` : 'Log a trip'}</Button>
      }>Pantry</PageTitle>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card id="Grocery list" title={list.length ? `The List · ${list.length} to buy` : 'The List'} className="self-start">
          <div className="flex flex-col gap-3">
            <AddLine names={items.map(i => i.name)} onAdded={(n, again) => n > 1 && toast(`${n} on the list${again ? ` (${again} again)` : ''}`, 'gold')} />
            {list.length === 0 ? <Empty>The list is empty.</Empty> : byAisle(list).map(s => (
              <div key={s.key}>
                <h3 className="mb-1 font-display text-[13px] text-lav">{s.label}</h3>
                <ul className="flex flex-col gap-1">
                  {s.items.map(i => <ListRow key={i.id} item={i} onEdit={() => setEditing(i)} />)}
                </ul>
              </div>
            ))}
            {list.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-dashed border-line/40 pt-3">
                <span className="font-type text-sm text-ink/70">{cart.length ? `${cart.length} of ${list.length} in the cart` : 'tick what goes in the cart'}</span>
                <Button variant={cart.length ? 'primary' : 'ghost'} onClick={() => setFinishing(true)}>{cart.length ? 'Finish trip' : 'Log a trip'}</Button>
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card id="Running low" title={low.length ? `Running low · ${low.length}` : 'Running low'}>
            {low.length === 0 ? (
              <Empty>{items.some(i => i.bought.length >= 2) ? 'Nothing should run out before your next trip.' : 'After you buy something twice, the Pantry learns how often you need it.'}</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                <ul className="flex flex-col gap-1">
                  {low.map(({ item, r }) => (
                    <li key={item.id} className="flex min-h-[44px] items-center gap-2 border border-line/40 bg-panel2/60 pl-3">
                      <button onClick={() => setEditing(item)} className="min-w-0 flex-1 py-1 text-left">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block truncate text-[11px] text-ink/60">every ~{r.every} d · last {agoText(r.since)}</span>
                      </button>
                      <Button variant="ghost" className="!min-h-[40px] !px-3" aria-label={`Add ${item.name} to the list`} onClick={() => relist(item)}><Glyph name="plus" size={16} /></Button>
                    </li>
                  ))}
                </ul>
                {low.length > 1 && <Button variant="cyan" className="mt-1 self-end" onClick={async () => { for (const l of low) await relist(l.item); toast(`${low.length} on the list`, 'gold'); }}>Add all {low.length}</Button>}
              </div>
            )}
            {remembered.length > 0 && (
              <div className="mt-3">
                <h3 className="mb-1 font-display text-[13px] text-lav">Usuals</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(allUsuals ? remembered : remembered.slice(0, USUALS_SHOWN)).map(i => (
                    <button key={i.id} onClick={() => relist(i)} title={`Add ${i.name}`} className="mac-btn flex min-h-[40px] items-center gap-1 bg-white px-2.5 font-display text-[13px]">
                      <Glyph name="plus" size={12} stroke={2} />{i.name}
                    </button>
                  ))}
                  {remembered.length > USUALS_SHOWN && (
                    <button onClick={() => setAllUsuals(v => !v)} className="min-h-[40px] px-2 font-display text-[13px] text-cyan underline">{allUsuals ? 'Fewer' : `All ${remembered.length}`}</button>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card id="Trips" title="Trips">
            <TripSummary trips={trips} today={today} />
            {trips.length === 0 ? <Empty>No trips yet.</Empty> : (
              <ul className="mt-3 flex flex-col gap-1">
                {trips.slice(0, 12).map(t => <TripRow key={t.id} trip={t} />)}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ItemSheet item={editing} onClose={() => setEditing(null)} today={today} tripEvery={stats.every} />
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} cart={cart} left={list.length - cart.length} trips={trips} today={today}
        onDone={t => toast(t.items.length ? `Trip logged · ${t.items.length} bought` : 'Trip logged', 'gold')} />
    </div>
  );
}

/** One line + Enter: "leche, 2 kg jitomate, pan". Remembered names autocomplete. */
function AddLine({ names, onAdded }: { names: string[]; onAdded: (n: number, again: number) => void }) {
  const [text, setText] = useState('');
  const parsed = text.trim() ? parseGroceryInput(text) : [];
  const add = async (t: string) => {
    if (!t.trim()) return;
    setText(''); // cleared first: what is typed while saving must not be wiped
    const r = await addToList(t);
    onAdded(r.total, r.again);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input value={text} list="pantry-names" aria-label="Add to the grocery list" placeholder="Add: leche, 2 kg jitomate, pan… Enter" enterKeyHint="done" autoCapitalize="sentences" maxLength={GROCERY_NAME_MAX * 20}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(text); } }}
          onPaste={e => {
            const pasted = e.clipboardData.getData('text');
            if (!/\n/.test(pasted.trim())) return;
            e.preventDefault();
            void add(pasted);
          }} />
        <Button variant="ghost" className="!px-3" aria-label="Add to the list" disabled={!parsed.length} onClick={() => add(text)}><Glyph name="plus" size={16} /></Button>
      </div>
      <datalist id="pantry-names">{names.map(n => <option key={n} value={n} />)}</datalist>
      <div className="flex min-h-[20px] flex-wrap items-center gap-1.5 text-[11px] text-ink/55">
        {parsed.length ? parsed.slice(0, 8).map(p => <Chip key={itemKey(p.name)}>{p.name}{p.qty ? ` · ${p.qty}` : ''} · {sectionLabel(guessSection(p.name)).toLowerCase()}</Chip>)
          : <span className="font-type">commas or a pasted list add many · a quantity goes first or last</span>}
      </div>
    </div>
  );
}

function ListRow({ item, onEdit }: { item: GroceryItem; onEdit: () => void }) {
  const done = !!item.inCart;
  return (
    <li className={cx('flex min-h-[44px] items-center gap-1 border border-line/40', done ? 'bg-mint/30' : 'bg-white/80')}>
      <button onClick={() => toggleCart(item)} role="checkbox" aria-checked={done} aria-label={`${item.name}: ${done ? 'in the cart' : 'not in the cart yet'}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center">
        <span className={cx('mac-inset flex h-6 w-6 items-center justify-center', done ? 'bg-mint' : 'bg-white')}>{done && <Glyph name="check" size={16} stroke={2.4} />}</span>
      </button>
      <button onClick={onEdit} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left">
        <span className={cx('truncate text-[15px]', done && 'text-ink/50 line-through')}>{item.name}</span>
        {item.qty && <span className="shrink-0 font-type text-[12px] text-ink/60">{item.qty}</span>}
      </button>
      <button onClick={() => unlist(item)} aria-label={`Take ${item.name} off the list`} title="Take off the list" className="flex h-11 w-11 shrink-0 items-center justify-center text-ink/40 hover:text-hp">
        <Glyph name="close" size={14} />
      </button>
    </li>
  );
}

function TripSummary({ trips, today }: { trips: GroceryTrip[]; today: string }) {
  const s = tripStats(trips, today);
  if (!s.last) return <p className="font-type text-sm text-ink/70">Finish a trip, or log one, and it shows here.</p>;
  const late = s.known && s.next && s.next < today;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      <div><dt className="font-display text-[12px] text-lav">Last trip</dt><dd>{agoText(s.since ?? 0)}{s.last.store ? ` · ${s.last.store}` : ''}</dd></div>
      <div><dt className="font-display text-[12px] text-lav">{s.known ? 'You go about' : 'Next trip'}</dt>
        <dd>{s.known ? `every ${s.every} days` : 'two trips to know your rhythm'}{s.known && s.next && <span className={cx('block text-[12px]', late ? 'text-hp' : 'text-ink/60')}>{late ? `due since ${dayText(s.next).toLowerCase()}` : `next ${s.next === today ? 'today' : dayText(s.next).toLowerCase()}`}</span>}</dd></div>
      <div><dt className="font-display text-[12px] text-lav">This month</dt><dd className="tabular-nums">{mxn(s.month)}</dd></div>
      <div><dt className="font-display text-[12px] text-lav">Per trip</dt><dd className="tabular-nums">{s.avg !== undefined ? `≈ ${mxn(s.avg)}` : '—'}</dd></div>
    </dl>
  );
}

function TripRow({ trip }: { trip: GroceryTrip }) {
  const del = async () => {
    const tx = trip.txId ? await db.transactions.get(trip.txId) : undefined;
    if (!confirm(`Delete the trip of ${dayText(trip.date)}?${tx ? ` Its expense of ${mxn(-tx.amount, 2)} is deleted from the Treasury too.` : ''} The items stay remembered.`)) return;
    await deleteTrip(trip);
  };
  const what = trip.items.length ? trip.items.slice(0, 6).join(', ') + (trip.items.length > 6 ? ` +${trip.items.length - 6}` : '') : 'no list';
  return (
    <li className="flex min-h-[44px] items-center gap-2 border border-line/40 bg-panel2/60 pl-3">
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate font-medium">{dayText(trip.date)}{trip.store ? ` · ${trip.store}` : ''}</span>
          {trip.total !== undefined && <span className="shrink-0 font-display tabular-nums">{mxn(trip.total)}</span>}
        </div>
        <div className="truncate text-[11px] text-ink/60">{what}</div>
      </div>
      <button onClick={del} aria-label={`Delete the trip of ${dayText(trip.date)}`} className="flex h-11 w-11 shrink-0 items-center justify-center text-ink/40 hover:text-hp"><Glyph name="trash" size={16} /></button>
    </li>
  );
}

function ItemSheet({ item, onClose, today, tripEvery }: { item: GroceryItem | null; onClose: () => void; today: string; tripEvery: number }) {
  return (
    <Modal open={!!item} onClose={onClose} title={item?.name ?? 'Item'}>
      {item && <ItemForm key={item.id} item={item} onClose={onClose} today={today} tripEvery={tripEvery} />}
    </Modal>
  );
}

function ItemForm({ item, onClose, today, tripEvery }: { item: GroceryItem; onClose: () => void; today: string; tripEvery: number }) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty ?? '');
  const [section, setSection] = useState<GrocerySection>(item.section);
  const r = restock(item.bought, today, tripEvery);
  const last = item.bought.at(-1);
  const times = new Set(item.bought).size;
  const save = async () => { await saveItem(item, { name, qty, section }); onClose(); };
  return (
    <div className="flex flex-col gap-3">
      <p className="font-type text-sm text-ink/75">
        {times === 0 ? 'Not bought yet.' : `Bought ${times === 1 ? 'once' : `${times} times`}${last ? `, last ${agoText(daysBetween(last, today))}` : ''}.`}
        {r && ` About every ${r.every} days${r.due ? ': it will probably run out before your next trip.' : '.'}`}
        {times === 1 && ' One more purchase and the Pantry knows its rhythm.'}
      </p>
      <Label text="Name"><Input value={name} maxLength={GROCERY_NAME_MAX} onChange={e => setName(e.target.value)} /></Label>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Quantity"><Input value={qty} maxLength={20} placeholder="e.g. 2 kg" onChange={e => setQty(e.target.value)} /></Label>
        <Label text="Aisle"><Select value={section} onChange={e => setSection(e.target.value as GrocerySection)}>{GROCERY_SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex gap-2">
          <Button variant="danger" aria-label={`Forget ${item.name}`} title="Forget" onClick={async () => {
            if (!confirm(`Forget ${item.name}? Its purchase history and suggestions go; past trips keep its name.`)) return;
            await forgetItem(item); onClose();
          }}><Glyph name="trash" size={16} /></Button>
          {item.needed
            ? <Button variant="ghost" onClick={async () => { await unlist(item); onClose(); }}>Off the list</Button>
            : <Button variant="cyan" onClick={async () => { await relist(item); onClose(); }}>Add to list</Button>}
        </div>
        <Button onClick={save} disabled={!itemKey(name)}>Save</Button>
      </div>
    </div>
  );
}

function FinishSheet({ open, onClose, cart, left, trips, today, onDone }: {
  open: boolean; onClose: () => void; cart: GroceryItem[]; left: number; trips: GroceryTrip[]; today: string; onDone: (t: GroceryTrip) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={cart.length ? 'Finish the trip' : 'Log a trip'}>
      {open && <FinishForm cart={cart} left={left} trips={trips} today={today} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function FinishForm({ cart, left, trips, today, onClose, onDone }: { cart: GroceryItem[]; left: number; trips: GroceryTrip[]; today: string; onClose: () => void; onDone: (t: GroceryTrip) => void }) {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter(a => !a.archived).toArray(), [], []);
  // The account of the last trip that logged its expense, so a card used every week is already chosen.
  const lastTxId = trips.find(t => t.txId)?.txId;
  const lastAccount = useLiveQuery(async () => (lastTxId ? (await db.transactions.get(lastTxId))?.accountId : undefined), [lastTxId]);
  const [date, setDate] = useState(today);
  const [store, setStore] = useState(trips[0]?.store ?? '');
  const [total, setTotal] = useState('');
  const [acc, setAcc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accountId = acc ?? lastAccount ?? accounts.find(a => a.type === 'debit')?.id ?? accounts[0]?.id ?? '';
  const n = parseMoney(total);
  const bad = total.trim() !== '' && !(n > 0);
  const stores = [...new Set(trips.map(t => t.store).filter((s): s is string => !!s))];
  const submit = async () => {
    if (bad || busy) return;
    setBusy(true);
    try {
      const t = await finishTrip({ date: date || today, store, total: n > 0 ? n : undefined, accountId: accountId || undefined });
      onDone(t);
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <p className="font-type text-sm text-ink/75">
        {cart.length ? `${cart.length} in the cart will be marked bought.` : 'Nothing is ticked: this records the visit only.'}
        {left > 0 && ` ${left} stay${left === 1 ? 's' : ''} on the list for next time.`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Date"><Input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} /></Label>
        <Label text="Store"><Input value={store} list="pantry-stores" maxLength={40} placeholder="e.g. Soriana" onChange={e => setStore(e.target.value)} /></Label>
      </div>
      <datalist id="pantry-stores">{stores.map(s => <option key={s} value={s} />)}</datalist>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Total spent (MXN)"><Input value={total} inputMode="decimal" placeholder="optional" onChange={e => setTotal(e.target.value)} aria-invalid={bad} /></Label>
        <Label text="Paid with"><Select value={accountId} onChange={e => setAcc(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          <option value="">Don't log the expense</option>
        </Select></Label>
      </div>
      <p className="text-[12px] text-ink/60">{bad ? 'The total must be an amount above zero.' : n > 0 && accountId ? `Logs a ${GROCERY_CATEGORY} expense of ${mxn(n, 2)} in the Treasury.` : 'With a total and an account, the expense is logged in the Treasury.'}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={bad || busy}>{cart.length ? 'Finish trip' : 'Log trip'}</Button>
      </div>
    </form>
  );
}
