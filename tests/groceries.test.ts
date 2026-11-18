import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  byAisle, cadence, guessSection, itemId, itemKey, parseGroceryInput, parseGroceryItem, restock, runningLow, tripStats, usuals,
  withPurchase, BOUGHT_KEEP, DEFAULT_TRIP_EVERY
} from '../src/lib/groceries';
import type { GroceryItem, GroceryTrip } from '../src/db/types';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { addToList, deleteTrip, finishTrip, saveItem, toggleCart, unlist, GROCERY_CATEGORY } from '../src/lib/pantryStore';
import { FINANCE_XP } from '../src/game/rules';
import { exportAll, importAll } from '../src/lib/backup';

const item = (name: string, o: Partial<GroceryItem> = {}): GroceryItem =>
  ({ id: itemId(name), name, section: guessSection(name), needed: false, bought: [], createdAt: 1, ...o });
const trip = (date: string, o: Partial<GroceryTrip> = {}): GroceryTrip => ({ id: date, date, items: [], createdAt: 1, ...o });

describe('parsing what is typed (pure)', () => {
  it('reads a quantity first or last, with or without a unit', () => {
    expect(parseGroceryItem('2 kg jitomate')).toEqual({ name: 'Jitomate', qty: '2 kg' });
    expect(parseGroceryItem('1 kg de jitomate')).toEqual({ name: 'Jitomate', qty: '1 kg' });
    expect(parseGroceryItem('3 aguacates')).toEqual({ name: 'Aguacates', qty: '3' });
    expect(parseGroceryItem('leche x3')).toEqual({ name: 'Leche', qty: 'x3' });
    expect(parseGroceryItem('huevo 1 docena')).toEqual({ name: 'Huevo', qty: '1 docena' });
    expect(parseGroceryItem('1,5 kg pollo')).toEqual({ name: 'Pollo', qty: '1,5 kg' });
    expect(parseGroceryItem('pan')).toEqual({ name: 'Pan' });
  });
  it('strips list bullets and boxes', () => {
    expect(parseGroceryItem('- leche')?.name).toBe('Leche');
    expect(parseGroceryItem('[ ] cafe')?.name).toBe('Cafe');
    expect(parseGroceryItem('2. arroz')?.name).toBe('Arroz');
    expect(parseGroceryItem('   ')).toBeNull();
  });
  it('splits on commas, new lines and "y", but not a decimal comma; the same item once', () => {
    expect(parseGroceryInput('leche, huevos, pan').map(p => p.name)).toEqual(['Leche', 'Huevos', 'Pan']);
    expect(parseGroceryInput('pan y leche').map(p => p.name)).toEqual(['Pan', 'Leche']);
    expect(parseGroceryInput('1,5 kg pollo\n- cafe\n\nhuevo; huevos')).toEqual([{ name: 'Pollo', qty: '1,5 kg' }, { name: 'Cafe' }, { name: 'Huevo' }]);
  });
});

describe('item identity (pure)', () => {
  it('ignores case, accents, spaces and plurals', () => {
    expect(itemKey('Jitomates ')).toBe(itemKey('jitomate'));
    expect(itemKey('Limones')).toBe(itemKey('limón'));
    expect(itemKey('Huevos')).toBe('huevo');
    expect(itemKey('Papas  fritas')).toBe('papa frita');
    expect(itemId('Café')).toBe('g:cafe');
  });
});

describe('aisles (pure)', () => {
  it('guesses the aisle in Spanish and English', () => {
    expect(guessSection('Jitomate')).toBe('produce');
    expect(guessSection('Tortillas')).toBe('bakery');
    expect(guessSection('Pechuga de pollo')).toBe('meat');
    expect(guessSection('Leche deslactosada')).toBe('dairy');
    expect(guessSection('Huevos')).toBe('dairy');
    expect(guessSection('Arroz')).toBe('pantry');
    expect(guessSection('Avocados')).toBe('produce');
    expect(guessSection('Detergente')).toBe('home');
    expect(guessSection('Shampoo')).toBe('care');
    expect(guessSection('Chunches')).toBe('other');
  });
  it('a known phrase beats its words; otherwise the first word decides', () => {
    expect(guessSection('Crema dental')).toBe('care');
    expect(guessSection('Papel de baño')).toBe('home');
    expect(guessSection('Jugo de naranja')).toBe('drinks');
    expect(guessSection('Ice cream')).toBe('frozen');
    expect(guessSection('Crema')).toBe('dairy');
  });
  it('groups the list in store order, the cart last inside an aisle', () => {
    const list = [item('Leche', { addedAt: 1 }), item('Jitomate', { addedAt: 2, inCart: true }), item('Cebolla', { addedAt: 3 })];
    expect(byAisle(list).map(s => [s.key, s.items.map(i => i.name)])).toEqual([['produce', ['Cebolla', 'Jitomate']], ['dairy', ['Leche']]]);
  });
});

describe('restocking (pure)', () => {
  it('needs two purchases to know a rhythm; uses the median gap', () => {
    expect(cadence([])).toBeNull();
    expect(cadence(['2026-11-01'])).toBeNull();
    expect(cadence(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-29'])).toBe(7);
    expect(cadence(['2026-11-01', '2026-11-01'])).toBeNull(); // the same day twice is one purchase
  });
  it('suggests an item that would run out before the trip after this one', () => {
    const eggs = ['2026-10-25', '2026-11-01', '2026-11-08']; // every 7 days
    // Shopping every 7 days, last bought 4 days ago: 4 + 7 > 7, it runs out before the next trip.
    expect(restock(eggs, '2026-11-12', 7)).toMatchObject({ every: 7, since: 4, due: true });
    // Shopping every 2 days: 4 + 2 < 7, it can wait.
    expect(restock(eggs, '2026-11-12', 2)).toMatchObject({ due: false });
    // Right after buying, with a weekly shop: exactly lasts until the next trip.
    expect(restock(eggs, '2026-11-08', 7)?.due).toBe(false);
  });
  it('lists running-low items most urgent first, never what is already on the list', () => {
    const items = [
      item('Huevo', { bought: ['2026-10-25', '2026-11-01', '2026-11-08'] }),
      item('Cafe', { bought: ['2026-10-01', '2026-10-15', '2026-10-29'] }),
      item('Leche', { bought: ['2026-11-01', '2026-11-08'], needed: true }),
      item('Sal', { bought: ['2026-11-10'] })
    ];
    expect(runningLow(items, '2026-11-12', 7).map(x => x.item.name)).toEqual(['Cafe', 'Huevo']);
  });
  it('keeps a purchase day once, and only the last few', () => {
    expect(withPurchase(['2026-11-02'], '2026-11-02')).toEqual(['2026-11-02']);
    const many = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    expect(withPurchase(many, '2026-11-01')).toHaveLength(BOUGHT_KEEP);
    expect(withPurchase(many, '2026-11-01').at(-1)).toBe('2026-11-01');
  });
  it('usuals: bought at least twice, off the list, most bought first', () => {
    const items = [item('A', { bought: ['2026-11-01', '2026-11-02'] }), item('B', { bought: ['2026-11-01', '2026-11-02', '2026-11-03'] }), item('C', { bought: ['2026-11-01'] })];
    expect(usuals(items).map(i => i.name)).toEqual(['B', 'A']);
  });
});

describe('trips (pure)', () => {
  it('knows the rhythm, the next trip and the month', () => {
    const s = tripStats([trip('2026-10-28', { total: 500 }), trip('2026-11-04', { total: 700 }), trip('2026-11-11', { total: 900, store: 'Soriana' })], '2026-11-13');
    expect(s).toMatchObject({ every: 7, known: true, since: 2, next: '2026-11-18', month: 1600, last30: 2100, avg: 700 });
    expect(s.last?.store).toBe('Soriana');
  });
  it('assumes a weekly shop until there are two trips', () => {
    expect(tripStats([], '2026-11-13')).toMatchObject({ every: DEFAULT_TRIP_EVERY, known: false, month: 0 });
    expect(tripStats([trip('2026-11-10')], '2026-11-13')).toMatchObject({ known: false, since: 3, avg: undefined });
  });
});

describe('the Pantry (db)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });

  it('adds new items with a guessed aisle and brings back remembered ones', async () => {
    expect(await addToList('leche, 2 kg jitomate')).toMatchObject({ added: 2, again: 0 });
    expect(await db.groceries.get('g:jitomate')).toMatchObject({ name: 'Jitomate', qty: '2 kg', section: 'produce', needed: true, bought: [] });
    const milk = (await db.groceries.get('g:leche'))!;
    await saveItem(milk, { name: 'Leche', section: 'drinks', qty: '' });
    await unlist((await db.groceries.get('g:leche'))!);
    expect(await addToList('Leches')).toMatchObject({ added: 0, again: 1 });
    // The aisle the user chose stays; one row per item.
    expect(await db.groceries.get('g:leche')).toMatchObject({ needed: true, section: 'drinks' });
    expect(await db.groceries.count()).toBe(2);
  });

  it('a renamed item is found by its new name, and its old name can become a new item', async () => {
    await addToList('refresco');
    await saveItem((await db.groceries.get('g:refresco'))!, { name: 'Agua mineral', section: 'drinks', qty: '' });
    await unlist((await db.groceries.get('g:refresco'))!);
    expect(await addToList('agua mineral')).toMatchObject({ added: 0, again: 1 });
    expect(await addToList('refresco')).toMatchObject({ added: 1 });
    expect(await db.groceries.count()).toBe(2);
  });

  it('finishing a trip buys the cart, keeps the rest, and logs the expense like any transaction', async () => {
    await addToList('leche, pan, cafe');
    await toggleCart((await db.groceries.get('g:leche'))!);
    await toggleCart((await db.groceries.get('g:pan'))!);
    const debit = (await db.accounts.toArray()).find(a => a.type === 'debit')!;
    const t = await finishTrip({ date: '2026-11-12', store: 'Soriana', total: 845.5, accountId: debit.id });

    expect(t.items.sort()).toEqual(['Leche', 'Pan']);
    expect(await db.groceries.get('g:leche')).toMatchObject({ needed: false, inCart: false, bought: ['2026-11-12'] });
    expect(await db.groceries.get('g:cafe')).toMatchObject({ needed: true, bought: [] });
    const tx = (await db.transactions.get(t.txId!))!;
    expect(tx).toMatchObject({ accountId: debit.id, amount: -845.5, kind: 'expense', category: GROCERY_CATEGORY, date: '2026-11-12', description: 'Supermarket · Soriana' });
    expect((await db.xp.get(`tx:${tx.id}`))?.xp).toBe(FINANCE_XP.logTransaction);

    // Deleting the trip takes back the purchase day, the expense and its XP; the items stay remembered.
    await deleteTrip((await db.groceryTrips.get(t.id))!);
    expect(await db.groceries.get('g:leche')).toMatchObject({ bought: [] });
    expect(await db.transactions.get(tx.id)).toBeUndefined();
    expect(await db.xp.get(`tx:${tx.id}`)).toBeUndefined();
    expect(await db.groceries.count()).toBe(3);
  });

  it('records a visit with nothing ticked and no total, and logs nothing in the Treasury', async () => {
    const before = await db.transactions.count();
    const t = await finishTrip({ date: '2026-11-12' });
    expect(t).toMatchObject({ items: [], total: undefined, txId: undefined });
    expect(await db.groceryTrips.count()).toBe(1);
    expect(await db.transactions.count()).toBe(before);
  });

  it('groceries and trips are in backups; an older backup imports with them empty', async () => {
    await addToList('leche');
    await finishTrip({ date: '2026-11-12', store: 'Chedraui' });
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(backup.version).toBe(7);
    await Promise.all(db.tables.map(t => t.clear()));
    await importAll(backup);
    expect(await db.groceries.get('g:leche')).toMatchObject({ needed: true });
    expect(await db.groceryTrips.count()).toBe(1);
    delete backup.data.groceries; delete backup.data.groceryTrips; backup.version = 6;
    await importAll(backup);
    expect(await db.groceries.count()).toBe(0);
    expect(await db.groceryTrips.count()).toBe(0);
  });
});
