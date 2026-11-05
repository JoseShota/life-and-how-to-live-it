import { db, ALL_TABLES } from '@/db/db';

export const BACKUP_VERSION = 1;

export async function exportAll() {
  const data: Record<string, unknown[]> = {};
  for (const t of ALL_TABLES) data[t] = await db.table(t).toArray();
  return { app: 'life-and-how-to-live-it', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export async function importAll(json: unknown) {
  const b = json as { app?: string; data?: Record<string, unknown[]> };
  // 'ascenso' = backups made before the rename
  if (!['life-and-how-to-live-it', 'ascenso'].includes(b?.app ?? '') || !b.data) throw new Error('Not a Life and How to Live It backup file');
  await db.transaction('rw', ALL_TABLES.map(t => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      await db.table(t).clear();
      if (b.data![t]?.length) await db.table(t).bulkAdd(b.data![t]);
    }
  });
}

export function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
