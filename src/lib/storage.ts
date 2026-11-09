// S-3: keep the data on the device. Without a persistence grant, Chrome treats IndexedDB as "best effort" and may
// clear it when the device runs low on space. Chrome grants it silently to installed or often-used apps.

/** Asks the browser to keep this app's data. true = kept, false = refused, null = the browser can't say. */
export async function keepData(): Promise<boolean | null> {
  try {
    const s = navigator.storage;
    if (!s?.persist || !s.persisted) return null;
    return (await s.persisted()) || (await s.persist());
  } catch { return null; }
}

/** Whether the data is already kept, without asking. */
export async function dataKept(): Promise<boolean | null> {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}

/** Days between backup reminders on a device. */
export const BACKUP_EVERY_DAYS = 7;

/** A reminder is due when this device never exported a backup, or the last one is older than the interval. */
export function backupDue(lastBackupAt: number | undefined | null, now = Date.now(), days = BACKUP_EVERY_DAYS) {
  return !lastBackupAt || now - lastBackupAt > days * 864e5;
}

/** Whole days since the last backup (null when there is none). */
export const daysSince = (at: number | undefined | null, now = Date.now()) => (at ? Math.floor((now - at) / 864e5) : null);
