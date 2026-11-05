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
      if (e.source === 'reward') setTimeout(() => push(`${e.label} (¢${e.coins})`, 'gold'));
      else if (e.xp > 0) setTimeout(() => push(`+${e.xp} XP · +¢${e.coins} — ${e.label}`, e.source === 'perfect-day' ? 'epic' : 'xp'));
    };
    db.xp.hook('creating', fn as never);
    const off = onAchievement(a => push(`🏆 ${a.name} unlocked! +${a.xp} XP`, 'epic'));
    return () => { db.xp.hook('creating').unsubscribe(fn as never); off(); };
  }, [push]);

  const head = { xp: '✦ You\'ve got XP!', gold: '¢ Transaction complete', bad: '⚠ Error', epic: '★ A C H I E V E M E N T ★' };
  const bar = { xp: 'titlebar', gold: 'bg-gold', bad: 'bg-hp', epic: 'titlebar' };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-[64px] right-2 z-50 flex w-[min(360px,calc(100vw-1rem))] flex-col gap-2" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        {items.map(t => (
          <div key={t.id} className={`toast-in bevel-out bg-panel ${t.tone === 'epic' ? 'shadow-glow' : ''}`}>
            <div className={`${bar[t.tone]} px-2 py-0.5 font-display text-lg leading-5 text-[#1d0b3d]`}>{head[t.tone]}</div>
            <div className="px-3 py-2 text-sm font-semibold">{t.text}</div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
