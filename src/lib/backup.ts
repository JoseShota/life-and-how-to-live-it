import { db, ALL_TABLES, rekeyXpV13 } from '@/db/db';
import { legacyIcon, ICON_TABLES } from '@/db/legacy';

export const BACKUP_VERSION = 5; // v2 adds statements and installments, v3 pipelineEvents, v4 reviews, v5 areaHours (older backups import with them empty)

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
      let rows = b.data![t] ?? [];
      if ((ICON_TABLES as readonly string[]).includes(t)) rows = rows.map(r => legacyIcon({ ...(r as Record<string, unknown>) }, t));
      // Backups made before v13 have random XP ids; give each row its refId as id, like the v13 upgrade does.
      if (t === 'xp') rows = rekeyXpV13(rows as { id: string; refId: string; ts: number }[]);
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
  });
}

export function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
