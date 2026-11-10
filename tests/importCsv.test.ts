import { describe, it, expect } from 'vitest';
import { candidatesFromCsv, detectColumns, detectDelimiter, parseBankDate, parseCsv, parseMoney } from '../src/finance/importCsv';

describe('reading a CSV', () => {
  it('handles quotes, doubled quotes, line breaks in quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",3\n\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', '3']]);
  });
  it('detects the delimiter', () => {
    expect(detectDelimiter('Fecha;Concepto;Cargo;Abono\n01/11/2026;OXXO;45.00;')).toBe(';');
    expect(detectDelimiter('Fecha\tConcepto\tImporte')).toBe('\t');
    expect(detectDelimiter('Fecha,Concepto,Importe')).toBe(',');
  });
});

describe('dates and money as banks write them', () => {
  it('reads dates, day first', () => {
    expect(parseBankDate('2026-11-05')).toBe('2026-11-05');
    expect(parseBankDate('05/11/2026')).toBe('2026-11-05');
    expect(parseBankDate('5-11-26')).toBe('2026-11-05');
    expect(parseBankDate('05/NOV/2026')).toBe('2026-11-05');
    expect(parseBankDate('5 ene 2027')).toBe('2027-01-05');
    expect(parseBankDate('05-Dec-26')).toBe('2026-12-05');
    expect(parseBankDate('31/02/2026')).toBeNull();
    expect(parseBankDate('Saldo anterior')).toBeNull();
  });
  it('reads money', () => {
    expect(parseMoney('$1,234.56')).toBe(1234.56);
    expect(parseMoney('-45.00')).toBe(-45);
    expect(parseMoney('(1,000.00)')).toBe(-1000);
    expect(parseMoney('230.5-')).toBe(-230.5);
    expect(parseMoney('$ 99 MXN')).toBe(99);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('n/a')).toBeNull();
  });
});

describe('columns', () => {
  it('finds the header under a few lines of preamble, in Spanish or English', () => {
    const rows = parseCsv('Banorte\nCuenta: ****1234\n\nFecha de Operación,Descripción,Cargos,Abonos,Saldo\n01/11/2026,OXXO,45.00,,955.00');
    expect(detectColumns(rows)).toEqual({ header: 2, cols: { date: 0, description: 1, charge: 2, credit: 3 } });
    expect(detectColumns(parseCsv('Date,Description,Amount\n2026-11-01,Coffee,-60'))).toEqual({ header: 0, cols: { date: 0, description: 1, amount: 2 } });
    expect(detectColumns(parseCsv('a,b,c\n1,2,3'))).toBeNull();
  });
});

describe('candidates', () => {
  const debit = { id: 'd', type: 'debit' as const }, card = { id: 'c', type: 'credit' as const };
  const csv = 'Fecha,Concepto,Cargo,Abono\n01/11/2026,OXXO  CENTRO,45.00,\n02/11/2026,NOMINA CIDE,,"12,000.00"\n02/11/2026,UBER,120.00,\n02/11/2026,UBER,120.00,\nSaldo final,,,\n';

  it('signs charges and credits, skips rows that are not movements', () => {
    const { candidates, skipped, error } = candidatesFromCsv(csv, { account: debit, existing: [] });
    expect(error).toBeUndefined();
    expect(skipped).toBe(1);
    expect(candidates.map(c => [c.date, c.description, c.amount])).toEqual([
      ['2026-11-01', 'OXXO CENTRO', -45], ['2026-11-02', 'NOMINA CIDE', 12000], ['2026-11-02', 'UBER', -120], ['2026-11-02', 'UBER', -120]
    ]);
    expect(candidates.every(c => !c.duplicate && !c.cardPayment && c.category === 'Other')).toBe(true);
    expect(candidates[0].line).toBe(2);
  });

  it('marks what is already logged, one ledger row per candidate, and reuses the last category', () => {
    const existing = [
      { accountId: 'd', date: '2026-11-02', amount: -120, description: 'Uber', category: 'Transport', kind: 'expense' as const },
      { accountId: 'x', date: '2026-11-01', amount: -45, description: 'oxxo centro', category: 'Food', kind: 'expense' as const }
    ];
    const { candidates } = candidatesFromCsv(csv, { account: debit, existing });
    expect(candidates.map(c => c.duplicate)).toEqual([false, false, true, false]); // other account's row is not a match
    expect(candidates[0].category).toBe('Food');
    expect(candidates[3].category).toBe('Transport');
  });

  it('a single amount column can be flipped for cards; payments into a card are flagged', () => {
    const one = 'Fecha;Descripción;Importe\n03/11/2026;AMAZON MX;899.00\n10/11/2026;PAGO RECIBIDO GRACIAS;-5,000.00\n';
    const { candidates } = candidatesFromCsv(one, { account: card, existing: [], chargesPositive: true });
    expect(candidates.map(c => [c.amount, c.cardPayment])).toEqual([[-899, false], [5000, true]]);
    expect(candidatesFromCsv(one, { account: card, existing: [] }).candidates[0].amount).toBe(899);
  });

  it('says so when it cannot find the columns', () => {
    expect(candidatesFromCsv('hello\nworld', { account: debit, existing: [] }).error).toMatch(/header/);
  });
});
