# Phase 5 prompts — Wealth pro

## P5-1 Banorte import
```
Build an import wizard at /money/import. Step 1: upload CSV (start with CSV exported from Banorte online banking;
I will provide a sample file with personal data removed — ask me for it before guessing the format).
Step 2: column mapping UI (date, description, amount or debit/credit columns), saved per account as a template.
Step 3: preview with auto-category via rules (src/finance/rules.ts: contains-text → category, editable list),
duplicates flagged by hash(date|amount|normalizedDescription). Step 4: import → transactions + XP (respect daily cap).
PDF statements later: extract text with pdf.js in the browser, then the same pipeline.
```

## P5-3 Budgets · P5-4 Net worth history · P5-6 Projection simulator
```
Budgets: `budgets` table {category, monthlyLimit}; bars on Money; warning toast at 80% and 100%.
Net worth history: `snapshots` table, one row per day (taken on first open), line chart on Money.
Projection simulator: pure function futureValue(monthly, annualRate, years, initial) with tests;
UI sliders; mark when the curve crosses 1M and 10M MXN; default monthly = average of last 3 months' (income - expense).
```

## P5-7 / P5-8 Invoices & freelance CRM
```
Invoices: {id, client, concept, subtotal, iva, total, issuedAt, paidAt?, cfdiUuid?}. Unpaid list on Money.
On payment: create income transaction linked to area + suggest moving the tax-reserve % to savings (setting, default 15%).
CRM: clients {name, contact, areaId, rateType hourly|fixed|retainer, rate}; link opportunities and invoices to clients.
Client view shows lifetime revenue and effective MXN/h (using sessions tagged with clientId — add optional clientId to Session).
```
