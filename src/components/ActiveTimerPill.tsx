import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
import { db } from '@/db/db';
import { useNow } from '@/lib/hooks';
import type { ActiveTimer } from '@/pages/Focus';

export function ActiveTimerPill() {
  const loc = useLocation();
  const t = useLiveQuery(() => db.settings.get('activeTimer'))?.value as ActiveTimer | undefined;
  const area = useLiveQuery(() => (t ? db.areas.get(t.areaId) : undefined), [t?.areaId]);
  const now = useNow();
  if (!t || loc.pathname === '/focus') return null;
  const s = Math.floor((now - t.start) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  return (
    <Link to="/focus" className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full border border-xp bg-panel px-4 py-2 text-sm font-semibold shadow-glow lg:bottom-6">
      <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{area?.emoji} {mm}:{ss}
    </Link>
  );
}
