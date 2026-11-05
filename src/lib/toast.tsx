import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { db } from '@/db/db';
import { onAchievement } from '@/game/achievements';

interface Toast { id: number; text: string; tone: 'xp' | 'gold' | 'bad' | 'epic' }
const Ctx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(Ctx);

let n = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'xp') => {
    const id = ++n;
    setItems(s => [...s.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems(s => s.filter(t => t.id !== id)), tone === 'epic' ? 5000 : 2600);
  }, []);

  useEffect(() => {
    // Every XP event anywhere in the app produces a floating reward toast.
    const fn = (_pk: unknown, e: { xp: number; coins: number; source: string; label: string }) => {
      if (e.source === 'achievement') return; // handled below with an epic toast
      if (e.source === 'reward') setTimeout(() => push(`${e.label}  ${e.coins} 🪙`, 'gold'));
      else if (e.xp > 0) setTimeout(() => push(`+${e.xp} XP  +${e.coins} 🪙 · ${e.label}`, e.source === 'perfect-day' ? 'epic' : 'xp'));
    };
    db.xp.hook('creating', fn as never);
    const off = onAchievement(a => push(`🏆 ${a.name} unlocked! +${a.xp} XP`, 'epic'));
    return () => { db.xp.hook('creating').unsubscribe(fn as never); off(); };
  }, [push]);

  const tone = { xp: 'border-xp/60 bg-xp/15', gold: 'border-gold/60 bg-gold/15', bad: 'border-hp/60 bg-hp/15', epic: 'border-gold bg-gradient-to-r from-xp/40 to-gold/30 shadow-glow' };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {items.map(t => (
          <div key={t.id} className={`toast-in rounded-xl border px-4 py-2 text-sm font-semibold backdrop-blur ${tone[t.tone]}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
