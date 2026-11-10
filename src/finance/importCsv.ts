// P5-1 statement import, CSV first. PURE: text in, candidate transactions out. Tested in tests/importCsv.test.ts.
// Bank exports differ, so nothing here is tied to one layout: the delimiter and the columns are detected from the
// header row (Spanish and English names), and the screen shows every row before anything is saved.
import type { Account, Transaction } from '@/db/types';

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, and line breaks inside quotes. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

/** The delimiter that splits the first lines most often: comma, semicolon, tab or pipe. */
export function detectDelimiter(text: string) {
  const head = text.split(/\r?\n/).slice(0, 8).join('\n');
  return [',', ';', '\t', '|'].map(d => [d, head.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A date as banks write it: 2026-11-05, 05/11/2026, 05-11-26, 05/nov/2026, 5 nov 2026. Day comes first. */
export function parseBankDate(text: string): string | null {
  const t = fold(text);
  const out = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    const x = new Date(y, m - 1, d);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  };
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (m) return out(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})\b/.exec(t);
  if (m) return out(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[-/. ]+([a-z]{3})[a-z]*\.?[-/. ]+(\d{2}|\d{4})\b/.exec(t);
  if (m) { const i = Math.max(MONTHS.indexOf(m[2]), MONTHS_EN.indexOf(m[2])); return i >= 0 ? out(+m[3], i + 1, +m[1]) : null; }
  return null;
}

/** Money as banks write it in Mexico: "$1,234.56", "1234.56", "-1,234.56", "(1,234.56)", "1,234.56-". */
export function parseMoney(text: string): number | null {
  let t = text.replace(/[\s$]|mxn|mn/gi, '');
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || t.startsWith('-') || t.endsWith('-');
  t = t.replace(/[()+-]/g, '').replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Math.round(Number(t) * 100) / 100;
  return negative ? -n : n;
}

export interface Columns { date: number; description: number; amount?: number; charge?: number; credit?: number }

const NAMES = {
  date: ['fecha', 'date', 'fecha de operacion', 'fecha operacion', 'fecha de transaccion', 'dia'],
  description: ['descripcion', 'concepto', 'description', 'detalle', 'movimiento', 'referencia', 'comercio'],
  amount: ['monto', 'importe', 'amount', 'cantidad'],
  charge: ['cargo', 'cargos', 'retiro', 'retiros', 'debit', 'debito', 'cargo (-)'],
  credit: ['abono', 'abonos', 'deposito', 'depositos', 'credit', 'credito', 'abono (+)']
};

/** Finds the header row and its columns. Null when no row names a date, a description and an amount. */
export function detectColumns(rows: string[][]): { header: number; cols: Columns } | null {
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const cells = rows[h].map(fold);
    const find = (names: string[]) => { const exact = cells.findIndex(c => names.includes(c)); return exact >= 0 ? exact : cells.findIndex(c => names.some(n => c.startsWith(n))); };
    const date = find(NAMES.date), description = find(NAMES.description);
    const amount = find(NAMES.amount), charge = find(NAMES.charge), credit = find(NAMES.credit);
    if (date < 0 || description < 0) continue;
    if (charge >= 0 || credit >= 0) return { header: h, cols: { date, description, charge: charge >= 0 ? charge : undefined, credit: credit >= 0 ? credit : undefined } };
    if (amount >= 0) return { header: h, cols: { date, description, amount } };
  }
  return null;
}

export interface Candidate {
  /** Line in the file (1 = first row), to find it again */
  line: number;
  date: string;
  description: string;
  /** Signed for the account: + money in, − money out (on a card, − is a purchase) */
  amount: number;
  /** Already in the ledger: same account, date and amount */
  duplicate: boolean;
  /** A payment into a credit card: in this app that is a transfer from another account, not income */
  cardPayment: boolean;
  category: string;
}

export interface ImportOptions {
  account: Pick<Account, 'id' | 'type'>;
  existing: Pick<Transaction, 'accountId' | 'date' | 'amount' | 'description' | 'category' | 'kind'>[];
  /**
   * A single amount column where purchases are positive (most card exports): flip it. Ignored when the file has
   * separate charge and credit columns.
   */
  chargesPositive?: boolean;
}

/**
 * Rows of a statement as candidate transactions. Rows without a readable date or amount are counted in
 * `skipped`, never guessed. A candidate matching a ledger row on the same account, date and amount is marked as
 * a duplicate (each ledger row matches one candidate, so two equal purchases on one day both survive when only
 * one is logged). The category is the one last used for the same description, else "Other".
 */
export function candidatesFromCsv(text: string, o: ImportOptions): { candidates: Candidate[]; skipped: number; error?: string } {
  const rows = parseCsv(text);
  const found = detectColumns(rows);
  if (!found) return { candidates: [], skipped: 0, error: 'No header row with a date, a description and an amount (or charge and credit) column was found.' };
  const { header, cols } = found;
  const mine = o.existing.filter(t => t.accountId === o.account.id);
  const pool = new Map<string, number>();
  for (const t of mine) { const k = `${t.date}|${t.amount.toFixed(2)}`; pool.set(k, (pool.get(k) ?? 0) + 1); }
  const lastCategory = new Map<string, string>();
  for (const t of o.existing) if (t.kind !== 'transfer' && t.description) lastCategory.set(`${t.kind}|${fold(t.description)}`, t.category);

  const candidates: Candidate[] = [];
  let skipped = 0;
  rows.slice(header + 1).forEach((r, i) => {
    const date = parseBankDate(r[cols.date] ?? '');
    let amount: number | null = null;
    if (cols.amount !== undefined) {
      const n = parseMoney(r[cols.amount] ?? '');
      amount = n === null ? null : o.chargesPositive ? -n : n;
    } else {
      const charge = cols.charge !== undefined ? parseMoney(r[cols.charge] ?? '') : null;
      const credit = cols.credit !== undefined ? parseMoney(r[cols.credit] ?? '') : null;
      if (charge) amount = -Math.abs(charge);
      else if (credit) amount = Math.abs(credit);
    }
    if (!date || !amount) { skipped++; return; }
    const description = (r[cols.description] ?? '').replace(/\s+/g, ' ').trim();
    const k = `${date}|${amount.toFixed(2)}`;
    const left = pool.get(k) ?? 0;
    if (left > 0) pool.set(k, left - 1);
    const kind = amount < 0 ? 'expense' : 'income';
    candidates.push({
      line: header + 2 + i, date, description, amount, duplicate: left > 0,
      cardPayment: o.account.type === 'credit' && amount > 0,
      category: lastCategory.get(`${kind}|${fold(description)}`) ?? 'Other'
    });
  });
  return { candidates, skipped };
}
