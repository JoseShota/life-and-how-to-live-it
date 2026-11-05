import { Glyph } from './Glyph';
import { PICKABLE } from './glyphs';
import { cx } from '@/lib/util';

export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return (
    <div className="mac-inset grid max-h-48 grid-cols-6 gap-1 overflow-y-auto p-1.5 sm:grid-cols-8">
      {PICKABLE.map(n => (
        <button key={n} type="button" title={n} aria-label={n} onClick={() => onChange(n)}
          className={cx('flex h-10 items-center justify-center', value === n ? 'bg-ink text-white' : 'hover:bg-mint/50')}>
          <Glyph name={n} size={22} />
        </button>
      ))}
    </div>
  );
}
