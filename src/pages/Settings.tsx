import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { IconPicker } from '@/components/IconPicker';
import { db, setSetting } from '@/db/db';
import { exportAll, importAll, download } from '@/lib/backup';
import { routineIcs } from '@/lib/routine';
import { useToast } from '@/lib/toast';
import { dateKey } from '@/lib/util';
import { useWorkTargets } from '@/lib/hooks';
import { evaluateDay } from '@/game/engine';
import { TaxSettings } from '@/components/TaxBits';
import { Button, Card, Input, Label, Modal, PageTitle } from '@/components/ui';

export default function SettingsPage() {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const name = (useLiveQuery(() => db.settings.get('playerName'))?.value as string) ?? '';
  const { all: targets } = useWorkTargets();
  const showMarquee = (useLiveQuery(() => db.settings.get('showMarquee'))?.value as boolean | undefined) ?? true;
  const setTarget = (kind: 'weekday' | 'weekend', which: 'done' | 'full', v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 16) return;
    const next = { ...targets, [kind]: { ...targets[kind], [which]: n } };
    // Re-grade today so the habit, bonus and focus XP follow the new targets right away.
    setSetting('workTargets', next).then(() => evaluateDay(dateKey()));
  };
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], []);
  const [iconFor, setIconFor] = useState<string | null>(null);
  const iconArea = areas.find(a => a.id === iconFor);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle jp="設定" plain="settings" sub="the machinery behind the dream">Control Panel</PageTitle>
      <Card title="The Player">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Name"><Input value={name} onChange={e => setSetting('playerName', e.target.value)} /></Label>
        </div>
        <h3 className="mt-4 font-display text-sm text-lav">Deep-work targets (hours)</h3>
        <p className="mb-2 text-xs text-ink/60">"Done" checks the deep-work habit. "Full" earns the workday bonus, and focus stops paying XP after it.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Label text="Weekday · done"><Input inputMode="decimal" value={targets.weekday.done} onChange={e => setTarget('weekday', 'done', e.target.value)} /></Label>
          <Label text="Weekday · full"><Input inputMode="decimal" value={targets.weekday.full} onChange={e => setTarget('weekday', 'full', e.target.value)} /></Label>
          <Label text="Weekend · done"><Input inputMode="decimal" value={targets.weekend.done} onChange={e => setTarget('weekend', 'done', e.target.value)} /></Label>
          <Label text="Weekend · full"><Input inputMode="decimal" value={targets.weekend.full} onChange={e => setTarget('weekend', 'full', e.target.value)} /></Label>
        </div>
      </Card>

      <TaxSettings />

      <Card title="Display">
        <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={showMarquee} onChange={e => setSetting('showMarquee', e.target.checked)} />
          Show the maxims ticker under the header (it also stops when the device asks for reduced motion)
        </label>
      </Card>

      <Card title="Areas · weekly hour targets">
        <div className="flex flex-col gap-2">
          {areas.map(a => (
            <div key={a.id} className="grid grid-cols-[2.5rem_1fr_5rem] items-center gap-2">
              <button type="button" onClick={() => setIconFor(a.id)} aria-label={`Change icon for ${a.name}`} title="Change icon"
                className="mac-inset flex h-10 w-10 items-center justify-center bg-white hover:bg-mint/50 focus-visible:bg-mint/50"><Glyph name={a.icon} size={22} /></button>
              <Input value={a.name} onChange={e => db.areas.update(a.id, { name: e.target.value })} />
              <Input inputMode="numeric" value={a.weeklyHoursTarget} onChange={e => db.areas.update(a.id, { weeklyHoursTarget: Number(e.target.value) || 0 })} />
            </div>
          ))}
        </div>
        <Modal open={!!iconArea} onClose={() => setIconFor(null)} title={`Icon · ${iconArea?.name ?? ''}`}>
          {iconArea && <IconPicker value={iconArea.icon} onChange={icon => { db.areas.update(iconArea.id, { icon }); setIconFor(null); }} />}
        </Modal>
      </Card>

      <Card title="Reminders">
        <p className="mb-3 text-sm text-ink/60">Your device calendar is the most reliable reminder engine. Import the ideal-day routine as daily recurring events with a 5-minute alert (works with Google Calendar, Apple Calendar, Outlook).</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => download('life-routine.ics', routineIcs(), 'text/calendar')}><Glyph name="calendar" size={16}/>Download routine (.ics)</Button>
          <Button variant="ghost" onClick={async () => { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifications enabled' : 'Notifications blocked', r === 'granted' ? 'xp' : 'bad'); }}><Glyph name="bell" size={16}/>Allow notifications</Button>
        </div>
        <p className="mt-2 text-xs text-ink/50">This only grants permission. Scheduled reminders arrive in Phase 4; until then, use Download routine (.ics).</p>
      </Card>

      <Card title="Backup · data & sync">
        <p className="mb-3 text-sm text-ink/60">All data lives on this device (offline-first). Until cloud sync ships (Phase 2), move data between tablet and laptop with a backup file. Back up weekly.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => download(`life-backup-${dateKey()}.json`, JSON.stringify(await exportAll()))}><Glyph name="download" size={16}/>Export backup</Button>
          <Button variant="ghost" onClick={() => file.current?.click()}><Glyph name="upload" size={16}/>Import backup</Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            if (!confirm('This REPLACES all data on this device with the backup. Continue?')) return;
            try { await importAll(JSON.parse(await f.text())); toast('Backup restored', 'gold'); } catch (err) { toast(String(err), 'bad'); }
            e.target.value = '';
          }} />
          <Button variant="danger" onClick={async () => { if (confirm('Erase EVERYTHING on this device?') && confirm('Really? Export a backup first.')) { await db.delete(); location.reload(); } }}>Reset app</Button>
        </div>
      </Card>
    </div>
  );
}
