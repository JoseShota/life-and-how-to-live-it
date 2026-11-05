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
    <Link to="/focus" className="bevel-out fixed bottom-[62px] right-3 z-30 flex items-center gap-2 bg-panel px-3 py-1.5 font-display text-xl shadow-glow">
      <span className="blink h-2.5 w-2.5 bg-hp" />REC {area?.emoji} {mm}:{ss}
    </Link>
  );
}
