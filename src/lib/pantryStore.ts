// The Pantry's writes (G-1). The rules live in groceries.ts (pure); this file only reads and writes Dexie.
// A trip pays nothing by itself: if it logs the expense, that expense pays like any logged transaction
// (rewardTransactionLogged), so the XP economy is unchanged.
import { db } from '@/db/db';
import type { GroceryItem, GrocerySection, GroceryTrip } from '@/db/types';
import { checkAchievements } from '@/game/achievements';
import { deleteTransaction, evaluateStatements, rewardTransactionLogged } from '@/game/engine';
import { dateKey, uid } from './util';
import { guessSection, itemId, itemKey, parseGroceryInput, tidyName, withPurchase } from './groceries';

/** Expense category a trip is logged under (the Treasury's spending pie keeps groceries with food). */
export const GROCERY_CATEGORY = 'Food';
export const GROCERY_TX_LABEL = 'Supermarket';

/** The row for a name: by its id, or by key when the item was renamed after it was created. */
export async function findItem(name: string): Promise<GroceryItem | undefined> {
  const k = itemKey(name);
  const direct = await db.groceries.get(itemId(name));
  if (direct && itemKey(direct.name) === k) return direct;
  return db.groceries.filter(i => itemKey(i.name) === k).first();
}

/**
 * Puts what was typed on the list. An item seen before keeps its aisle and history and comes back on the list;
 * a new one gets a guessed aisle. A quantity typed now replaces the old one; none typed keeps the last one.
 * Typing an item already on the list leaves it where it is (in the cart stays in the cart).
 */
export async function addToList(text: string, section?: GrocerySection) {
  const parsed = parseGroceryInput(text);
  let added = 0, again = 0;
  const now = Date.now();
  for (const [i, p] of parsed.entries()) {
    const old = await findItem(p.name);
    if (old) {
      if (!old.needed) again++;
      await db.groceries.update(old.id, { needed: true, inCart: old.needed ? old.inCart : false, qty: p.qty ?? old.qty, addedAt: old.needed ? old.addedAt : now + i, ...(section ? { section } : {}) });
    } else {
      added++;
      // The natural id is taken only when an item was renamed away from this name: give the new one its own.
      const id = (await db.groceries.get(itemId(p.name))) ? `${itemId(p.name)}#${uid()}` : itemId(p.name);
      await db.groceries.add({ id, name: p.name, section: section ?? guessSection(p.name), needed: true, qty: p.qty, addedAt: now + i, bought: [], createdAt: now + i });
    }
  }
  return { added, again, total: parsed.length };
}

/** One tap from the suggestions: back on the list with its last quantity. */
export const relist = (item: GroceryItem) => db.groceries.update(item.id, { needed: true, inCart: false, addedAt: Date.now() });

/** Off the list without buying it (still remembered). */
export const unlist = (item: GroceryItem) => db.groceries.update(item.id, { needed: false, inCart: false });

/** At the store: in the cart, or back out of it. */
export const toggleCart = (item: GroceryItem) => db.groceries.update(item.id, { inCart: !item.inCart });

/** Edits name, aisle and quantity. The id stays, so the item keeps its history. */
export async function saveItem(item: GroceryItem, patch: { name: string; section: GrocerySection; qty: string }) {
  const name = tidyName(patch.name);
  if (!itemKey(name)) return;
  await db.groceries.update(item.id, { name, section: patch.section, qty: patch.qty.trim() || undefined });
}

/** Forgets an item: its history and suggestions go with it. Past trips keep its name. */
export const forgetItem = (item: GroceryItem) => db.groceries.delete(item.id);

export interface FinishTrip {
  date?: string;
  store?: string;
  /** MXN spent; with an account, it is logged as an expense in the Treasury */
  total?: number;
  accountId?: string;
}

/**
 * Ends a trip: what is in the cart is bought (off the list, its purchase day remembered), the rest stays on the
 * list for next time. Records the visit even with an empty cart. With a total and an account, logs the expense.
 */
export async function finishTrip(f: FinishTrip = {}) {
  const date = f.date || dateKey();
  const total = f.total && f.total > 0 ? Math.round(f.total * 100) / 100 : undefined;
  const store = f.store?.trim() || undefined;
  let txId: string | undefined;
  if (total && f.accountId) {
    const acc = await db.accounts.get(f.accountId);
    if (acc) {
      txId = uid();
      await db.transactions.add({ id: txId, accountId: acc.id, date, amount: -total, kind: 'expense', category: GROCERY_CATEGORY, description: store ? `${GROCERY_TX_LABEL} · ${store}` : GROCERY_TX_LABEL, createdAt: Date.now() });
      await rewardTransactionLogged(txId);
      if (acc.type === 'credit') await evaluateStatements(acc.id);
      else await checkAchievements();
    }
  }
  const trip: GroceryTrip = { id: uid(), date, store, items: [], total, txId, createdAt: Date.now() };
  await db.transaction('rw', db.groceries, db.groceryTrips, async () => {
    const cart = (await db.groceries.toArray()).filter(i => i.inCart);
    trip.items = cart.map(i => i.name);
    for (const i of cart) await db.groceries.update(i.id, { needed: false, inCart: false, bought: withPurchase(i.bought, date) });
    await db.groceryTrips.add(trip);
  });
  return trip;
}

/**
 * Deletes a trip, the purchase days it gave its items (unless another trip that day bought them too) and the
 * expense it logged, with that expense's XP.
 */
export async function deleteTrip(trip: GroceryTrip) {
  await db.transaction('rw', db.groceries, db.groceryTrips, async () => {
    await db.groceryTrips.delete(trip.id);
    const sameDay = (await db.groceryTrips.where('date').equals(trip.date).toArray()).flatMap(t => t.items.map(itemKey));
    const keys = new Set(trip.items.map(itemKey).filter(k => !sameDay.includes(k)));
    for (const i of await db.groceries.toArray()) {
      if (keys.has(itemKey(i.name)) && i.bought.includes(trip.date)) await db.groceries.update(i.id, { bought: i.bought.filter(d => d !== trip.date) });
    }
  });
  const tx = trip.txId ? await db.transactions.get(trip.txId) : undefined;
  if (tx) await deleteTransaction(tx);
}
