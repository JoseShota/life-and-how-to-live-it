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
      if (e.source === 'reward') setTimeout(() => push(`${e.label} (${e.coins} dr)`, 'gold'));
      else if (e.xp > 0) setTimeout(() => push(`+${e.xp} XP · +${e.coins} dr — ${e.label}`, e.source === 'perfect-day' ? 'epic' : 'xp'));
    };
    db.xp.hook('creating', fn as never);
    const off = onAchievement(a => push(`${a.name} unlocked. +${a.xp} XP`, 'epic'));
    return () => { db.xp.hook('creating').unsubscribe(fn as never); off(); };
  }, [push]);

  const head = { xp: 'the universe noticed', gold: 'the agora thanks you', bad: 'something went quiet', epic: 'ACHIEVEMENT' };
  const tint = { xp: 'bg-white', gold: 'bg-laurel/40', bad: 'bg-white text-hp', epic: 'fill-pool' };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-[70px] right-2 z-50 flex w-[min(360px,calc(100vw-1rem))] flex-col gap-2 md:bottom-4" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        {items.map(t => (
          <div key={t.id} className="toast-in mac-window">
            <div className="mac-titlebar"><span className="mac-close" /><span className="mac-title !text-[13px]">{head[t.tone]}</span></div>
            <div className={`${tint[t.tone]} px-3 py-2 font-type text-[15px]`}><span className="bg-white/90 px-0.5">{t.text}</span></div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
