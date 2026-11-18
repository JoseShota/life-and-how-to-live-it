// The Pantry (G-1): pure rules for the grocery list. No DB, no React; tested in tests/groceries.test.ts.
//
// - parseGroceryInput(): one typed line (or a pasted list) → items with an optional quantity.
// - guessSection(): which aisle an item lives in, from its name (Spanish and English), so the list reads in the
//   order you walk the store. The user's choice is kept on the item and always wins over the guess.
// - restock(): from the days an item was bought, how often you buy it and whether it will run out before the
//   trip after this one. That is the "probably running low" list.
// - tripStats(): how often you go, when the next trip falls, what the supermarket costs a month.
import type { DateKey, GroceryItem, GrocerySection, GroceryTrip } from '@/db/types';
import { dateKey, parseKey } from './util';

/** Aisles in the order a Mexican supermarket is usually walked. */
export const GROCERY_SECTIONS: { key: GrocerySection; label: string }[] = [
  { key: 'produce', label: 'Fruit & veg' },
  { key: 'bakery', label: 'Bread & tortillas' },
  { key: 'meat', label: 'Meat & fish' },
  { key: 'dairy', label: 'Dairy & eggs' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'frozen', label: 'Frozen' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'home', label: 'Cleaning & home' },
  { key: 'care', label: 'Personal care' },
  { key: 'other', label: 'Other' }
];
export const sectionLabel = (s: GrocerySection) => GROCERY_SECTIONS.find(x => x.key === s)?.label ?? 'Other';

/** Purchase dates kept per item: enough for a steady median, small enough to keep rows light for sync. */
export const BOUGHT_KEEP = 12;
/** Gaps used for the median: recent habits matter more than last year's. */
const GAPS_USED = 6;
/** Until there are two trips, assume a weekly shop. */
export const DEFAULT_TRIP_EVERY = 7;
export const GROCERY_NAME_MAX = 60;

/** Lowercase, no accents, single spaces. */
export const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Singular of one word, so "Huevos" and "huevo" are the same item ("limones" → "limon", "papas" → "papa"). */
function singular(w: string) {
  if (w.length <= 3) return w;
  if (/[lnrdj]es$/.test(w) && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('ces')) return w.slice(0, -3) + 'z';
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** The identity of an item: "Jitomates " and "jitomate" are one row. */
export const itemKey = (name: string) => plain(name).replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean).map(singular).join(' ');

/** Deterministic id, so the same item added on the tablet and the laptop is one row once they sync. */
export const itemId = (name: string) => `g:${itemKey(name)}`;

/** Capital first letter, the rest as typed. */
export const tidyName = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, GROCERY_NAME_MAX);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// ---------- parsing ----------
const UNIT = 'kg|kgs|kilos?|g|gr|grs|gramos?|l|lt|lts|litros?|ml|pz|pza|pzas|pzs|piezas?|paq|paquetes?|latas?|bolsas?|cajas?|botellas?|docenas?|dozen|lb|lbs|oz|packs?|x';
const NUM = '\\d+(?:[.,]\\d+)?|\\d+\\/\\d+|medio|media|un|una|1\\/2';
const LEADING = new RegExp(`^(${NUM})\\s*(${UNIT})?\\.?\\s+(?:de\\s+|of\\s+)?(.+)$`, 'i');
const TRAILING = new RegExp(`^(.+?)\\s+(?:[x\\u00d7]\\s*(\\d+)|(${NUM})\\s*(${UNIT})\\.?)$`, 'i');

export interface ParsedGrocery { name: string; qty?: string }

/** Parses one item: "2 kg jitomate", "1 kg de jitomate", "leche x3", "huevo 1 docena", "pan". */
export function parseGroceryItem(raw: string): ParsedGrocery | null {
  const s = raw.replace(/^\s*(?:[-*•]|\[[ xX]?\]|\d+[.)](?=\s))\s*/, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const lead = s.match(LEADING);
  // "1 kg jitomate", but not "7 up": a bare number needs a unit or a word after it to be a quantity.
  if (lead && lead[3] && (lead[2] || /^[a-zÀ-ɏ]/i.test(lead[3]))) {
    const qty = `${lead[1]}${lead[2] ? ' ' + lead[2] : ''}`.toLowerCase();
    return { name: tidyName(lead[3]), qty: lead[2]?.toLowerCase() === 'x' ? `x${lead[1]}` : qty };
  }
  const trail = s.match(TRAILING);
  if (trail) {
    if (trail[2]) return { name: tidyName(trail[1]), qty: `x${trail[2]}` };
    if (trail[4]) return { name: tidyName(trail[1]), qty: `${trail[3]} ${trail[4]}`.toLowerCase() };
  }
  return { name: tidyName(s) };
}

/**
 * One line or a pasted list → items. Splits on new lines, semicolons and commas (not the decimal comma in
 * "1,5 kg"), and on " y " / " and " only between plain words ("pan y leche"). Same item twice → once.
 */
export function parseGroceryInput(text: string): ParsedGrocery[] {
  const parts = text.split(/\n|;|,(?!\d)/).flatMap(p => (/\d/.test(p) ? [p] : p.split(/\s+(?:y|and|&)\s+/i)));
  const seen = new Set<string>();
  const out: ParsedGrocery[] = [];
  for (const p of parts) {
    const item = parseGroceryItem(p);
    if (!item || !itemKey(item.name)) continue;
    const k = itemKey(item.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

// ---------- aisles ----------
const WORDS: Record<Exclude<GrocerySection, 'other'>, string> = {
  produce: 'manzana platano naranja limon lima aguacate jitomate tomate tomatillo cebolla ajo papa zanahoria chile jalapeno serrano poblano cilantro perejil lechuga espinaca pepino calabaza calabacita brocoli coliflor fruta verdura fresa uva mango pina papaya sandia melon pera durazno nopal elote champinon hongo pimiento apio jicama mandarina guayaba kiwi arandano frambuesa zarzamora chayote ejote betabel rabano jengibre epazote hierbabuena albahaca apple banana orange lemon avocado tomato onion garlic potato carrot lettuce spinach cucumber broccoli cauliflower berry blueberry strawberry grape fruit vegetable veggie kale celery pepper mushroom ginger zucchini',
  bakery: 'pan bolillo telera tortilla tostada concha baguette dona bread bagel croissant bun muffin',
  meat: 'pollo pechuga muslo carne res cerdo puerco molida bistec arrachera milanesa jamon salchicha chorizo tocino pescado salmon tilapia camaron pavo chicken beef pork ham bacon sausage fish shrimp turkey steak',
  dairy: 'leche huevo queso yogur yogurt yoghurt crema mantequilla requeson panela jocoque milk egg cheese butter cream kefir',
  pantry: 'arroz frijol pasta spaghetti fideo sopa aceite sal azucar harina avena cereal cafe te atun sardina salsa mayonesa mostaza catsup ketchup vinagre miel mermelada galleta granola lenteja garbanzo especia pimienta consome caldo chocolate cacahuate nuez almendra semilla chia linaza tostadita botana papita palomita rice bean oil salt sugar flour oat coffee tea tuna honey jam cookie cracker nut peanut noodle lentil chip snack spice',
  frozen: 'congelado congelada helado hielo nieve frozen icecream',
  drinks: 'agua refresco jugo cerveza vino soda juice beer wine water mineral electrolit suero kombucha tequila mezcal',
  home: 'detergente suavizante cloro cloralex fabuloso pinol lavatrastes esponja servilleta foco pila aluminio insecticida desinfectante limpiador trapeador escoba fibra detergent bleach sponge napkin foil battery cleaner',
  care: 'shampoo champu jabon desodorante cepillo rastrillo toallita algodon cotonete condon vitamina medicina paracetamol ibuprofeno curita bloqueador acondicionador soap deodorant toothpaste toothbrush floss razor conditioner lotion sunscreen vitamin medicine'
};
/** Phrases that beat their single words ("crema dental" is not dairy, "papel de baño" is not bakery). */
const PHRASES: [string, GrocerySection][] = [
  ['pasta dental', 'care'], ['crema dental', 'care'], ['hilo dental', 'care'], ['crema corporal', 'care'], ['protector solar', 'care'],
  ['toallas femeninas', 'care'], ['papel de bano', 'home'], ['papel higienico', 'home'], ['toilet paper', 'home'],
  ['paper towel', 'home'], ['toalla de papel', 'home'], ['bolsas de basura', 'home'], ['bolsa de basura', 'home'], ['trash bag', 'home'],
  ['jabon de trastes', 'home'], ['jabon para trastes', 'home'], ['dish soap', 'home'], ['jabon de ropa', 'home'],
  ['ice cream', 'frozen'], ['leche de almendra', 'dairy'], ['almond milk', 'dairy'], ['caldo de pollo', 'pantry'],
  ['agua mineral', 'drinks'], ['orange juice', 'drinks'], ['jugo de naranja', 'drinks'], ['pan molido', 'pantry']
];
const LOOKUP = new Map<string, GrocerySection>();
for (const [s, words] of Object.entries(WORDS)) for (const w of words.split(' ')) LOOKUP.set(w, s as GrocerySection);

/**
 * The aisle an item most likely lives in. A known phrase wins; otherwise the first word that names an aisle
 * ("jugo de naranja" is a drink, "pechuga de pollo" is meat). Unknown → 'other'.
 */
export function guessSection(name: string): GrocerySection {
  const p = ` ${plain(name).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const [phrase, s] of PHRASES) if (p.includes(` ${phrase} `) || p.includes(` ${phrase}s `)) return s;
  for (const w of p.trim().split(' ')) {
    const hit = LOOKUP.get(w) ?? LOOKUP.get(singular(w));
    if (hit) return hit;
  }
  return 'other';
}

// ---------- dates ----------
export const daysBetween = (a: DateKey, b: DateKey) => Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
export const addDays = (k: DateKey, n: number) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Distinct days, oldest first. */
const days = (xs: DateKey[]) => [...new Set(xs)].sort();

/** Adds a purchase day to an item's history (once per day, oldest dropped past BOUGHT_KEEP). */
export const withPurchase = (bought: DateKey[] | undefined, date: DateKey) => days([...(bought ?? []), date]).slice(-BOUGHT_KEEP);

/** Median gap between distinct days (the last few), or null with fewer than two days. */
export function cadence(dates: DateKey[]): number | null {
  const d = days(dates);
  if (d.length < 2) return null;
  const gaps = d.slice(1).map((k, i) => daysBetween(d[i], k)).slice(-GAPS_USED);
  return Math.max(1, Math.round(median(gaps)));
}

export interface Restock {
  /** You buy it about every N days */
  every: number;
  /** Days since you last bought it */
  since: number;
  /** It will run out before the trip after this one: buy it now */
  due: boolean;
  /** Days until it runs out at that rhythm (0 or less: already out); sorts the suggestions */
  left: number;
}

/**
 * Whether to buy an item on this trip. You buy it every `every` days and last did `since` days ago; the next
 * trip after this one is `tripEvery` days away. If it would run out before then, buy it now.
 * Needs two purchases to know a rhythm.
 */
export function restock(bought: DateKey[], today: DateKey, tripEvery = DEFAULT_TRIP_EVERY): Restock | null {
  const every = cadence(bought);
  if (every === null) return null;
  const since = daysBetween(days(bought).at(-1)!, today);
  return { every, since, due: since + tripEvery > every, left: every - since };
}

/** Items that are not on the list and will probably run out before the trip after this one, most urgent first. */
export function runningLow(items: GroceryItem[], today: DateKey, tripEvery = DEFAULT_TRIP_EVERY) {
  return items
    .filter(i => !i.needed)
    .map(item => ({ item, r: restock(item.bought ?? [], today, tripEvery) }))
    .filter((x): x is { item: GroceryItem; r: Restock } => !!x.r?.due)
    .sort((a, b) => a.r.left - b.r.left || a.item.name.localeCompare(b.item.name));
}

/** Items you have bought at least twice and are not on the list: the usual shop, most bought first. */
export function usuals(items: GroceryItem[]) {
  return items
    .filter(i => !i.needed && days(i.bought ?? []).length >= 2)
    .sort((a, b) => days(b.bought ?? []).length - days(a.bought ?? []).length || a.name.localeCompare(b.name));
}

/** The list grouped by aisle, in store order; inside an aisle, what is still to get comes before the cart. */
export function byAisle(items: GroceryItem[]) {
  return GROCERY_SECTIONS
    .map(s => ({
      ...s,
      items: items.filter(i => i.section === s.key).sort((a, b) => Number(!!a.inCart) - Number(!!b.inCart) || (a.addedAt ?? 0) - (b.addedAt ?? 0))
    }))
    .filter(s => s.items.length);
}

export interface TripStats {
  last?: GroceryTrip;
  /** Days since the last trip */
  since?: number;
  /** You go about every N days (median of recent gaps), or the default until there are two trips */
  every: number;
  known: boolean;
  /** When the next trip falls at that rhythm */
  next?: DateKey;
  /** Spent on trips this calendar month (MXN) */
  month: number;
  /** Spent in the 30 days before today, inclusive */
  last30: number;
  /** Average of the recent trips that have a total */
  avg?: number;
}

export function tripStats(trips: GroceryTrip[], today: DateKey): TripStats {
  const past = trips.filter(t => t.date <= today).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const last = past.at(-1);
  const c = cadence(past.map(t => t.date));
  const every = c ?? DEFAULT_TRIP_EVERY;
  const month = today.slice(0, 7);
  const from30 = addDays(today, -29);
  const priced = past.filter(t => (t.total ?? 0) > 0).slice(-8);
  return {
    last,
    since: last ? daysBetween(last.date, today) : undefined,
    every,
    known: c !== null,
    next: last ? addDays(last.date, every) : undefined,
    month: past.filter(t => t.date.startsWith(month)).reduce((s, t) => s + (t.total ?? 0), 0),
    last30: past.filter(t => t.date >= from30).reduce((s, t) => s + (t.total ?? 0), 0),
    avg: priced.length ? priced.reduce((s, t) => s + (t.total ?? 0), 0) / priced.length : undefined
  };
}

/** "today", "yesterday", "3 days ago". */
export const agoText = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);
