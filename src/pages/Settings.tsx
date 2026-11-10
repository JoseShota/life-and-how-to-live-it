import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Glyph } from '@/components/Glyph';
import { IconPicker } from '@/components/IconPicker';
import { db, setSetting } from '@/db/db';
import { exportAll, importAll, download } from '@/lib/backup';
import { WORK_START_CHOICES, routineIcs } from '@/lib/routine';
import { useToast } from '@/lib/toast';
import { dateKey } from '@/lib/util';
import { daysSince, dataKept, keepData } from '@/lib/storage';
import { useWorkStart, useWorkTargets } from '@/lib/hooks';
import { TeachingScheduleCard } from '@/components/TeachingBits';
import { evaluateDay } from '@/game/engine';
import { TaxSettings } from '@/components/TaxBits';
import { SyncCard } from '@/components/SyncCard';
import { HabitsCard } from '@/components/HabitBits';
import { SeasonCard } from '@/components/SeasonBits';
import { DEFAULT_INSCRIPTIONS } from '@/components/Layout';
import { Button, Card, Input, Label, Modal, PageTitle, Select } from '@/components/ui';

export default function SettingsPage() {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const name = (useLiveQuery(() => db.settings.get('playerName'))?.value as string) ?? '';
  const { all: targets, schedule } = useWorkTargets();
  const workStart = useWorkStart();
  const showMarquee = (useLiveQuery(() => db.settings.get('showMarquee'))?.value as boolean | undefined) ?? true;
  const setTarget = (kind: 'weekday' | 'weekend' | 'teaching', which: 'done' | 'full', v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 16) return;
    const next = { ...targets, [kind]: { ...targets[kind], [which]: n } };
    // Re-grade today so the habit, bonus and focus XP follow the new targets right away.
    setSetting('workTargets', next).then(() => evaluateDay(dateKey()));
  };
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), [], []);
  const place = areas.find(a => a.id === schedule?.areaId)?.short;
  const [iconFor, setIconFor] = useState<string | null>(null);
  const iconArea = areas.find(a => a.id === iconFor);
  const syncing = !!useLiveQuery(() => db.syncState.get('vaultId'), [], undefined);
  const lastBackupAt = useLiveQuery(() => db.settings.get('lastBackupAt'))?.value as number | undefined;
  const [kept, setKept] = useState<boolean | null | undefined>(undefined);
  useEffect(() => { void dataKept().then(setKept); }, []);
  const exportBackup = async () => { download(`life-backup-${dateKey()}.json`, JSON.stringify(await exportAll())); await setSetting('lastBackupAt', Date.now()); };
  const lastDays = daysSince(lastBackupAt);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle jp="設定" plain="settings" sub="settings, data, sync">Control Panel</PageTitle>
      <Card title="The Player">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Name"><Input value={name} onChange={e => setSetting('playerName', e.target.value)} /></Label>
        </div>
        <p className="mb-2 mt-4 text-xs text-ink/60">Deep work 1 starts here. Exercise, breakfast and intel share the morning until then; the work day moves with it and the evening's free time absorbs the change. Wake-up, the 20:00 shutdown and bedtime stay. After a change, download the routine again (Reminders) so the calendar follows.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Work starts at"><Select value={workStart} onChange={e => setSetting('workStart', e.target.value)}>
            {WORK_START_CHOICES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select></Label>
        </div>
        <h3 className="mt-4 font-display text-sm text-lav">Deep-work targets (hours)</h3>
        <p className="mb-2 text-xs text-ink/60">"Done" checks the deep-work habit. "Full" earns the workday bonus, and focus stops paying XP after it.</p>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[7rem_1fr_1fr] gap-3 font-display text-[13px] text-lav" aria-hidden><span /><span>Done</span><span>Full</span></div>
          {([['weekday', 'Weekday'], ['weekend', 'Weekend'], ['teaching', 'Teaching day']] as const).map(([kind, name]) => (
            <div key={kind} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-3">
              <span className="font-display text-sm">{name}</span>
              <Input inputMode="decimal" aria-label={`${name} · done`} value={targets[kind].done} onChange={e => setTarget(kind, 'done', e.target.value)} />
              <Input inputMode="decimal" aria-label={`${name} · full`} value={targets[kind].full} onChange={e => setTarget(kind, 'full', e.target.value)} />
            </div>
          ))}
          <p className="text-xs text-ink/60">Teaching days are the ones in "Teaching days" below, inside the semester.</p>
        </div>
      </Card>

      <SeasonCard today={dateKey()} />

      <HabitsCard />

      <TeachingScheduleCard />

      <TaxSettings />

      <Card title="Display">
        <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={showMarquee} onChange={e => setSetting('showMarquee', e.target.checked)} />
          Show the ticker under the header (it also stops when the device asks for reduced motion)
        </label>
        <Inscriptions />
        <SiteLink />
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
        <p className="mb-3 text-sm text-ink/60">Your device calendar is the most reliable reminder engine. Import the ideal-day routine as recurring events (teaching days get their own, until the semester ends) with a 5-minute alert (works with Google Calendar, Apple Calendar, Outlook).</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => download('life-routine.ics', routineIcs(schedule, place, dateKey(), workStart), 'text/calendar')}><Glyph name="calendar" size={16}/>Download routine (.ics)</Button>
          <Button variant="ghost" onClick={async () => { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifications enabled' : 'Notifications blocked', r === 'granted' ? 'xp' : 'bad'); }}><Glyph name="bell" size={16}/>Allow notifications</Button>
        </div>
        <p className="mt-2 text-xs text-ink/50">This only grants permission. Scheduled reminders arrive in Phase 4; until then, use Download routine (.ics).</p>
      </Card>

      <SyncCard />

      <Card title="Backup · data">
        <p className="mb-3 text-sm text-ink/60">Your data lives on this device (offline-first) and, with sync on, as an encrypted copy only your devices can read. A backup file is the copy no server holds: export one weekly.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportBackup}><Glyph name="download" size={16}/>Export backup</Button>
          <Button variant="ghost" onClick={() => file.current?.click()}><Glyph name="upload" size={16}/>Import backup</Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            if (!confirm(syncing
              ? 'This REPLACES all data on this device with the backup, and through sync on your other device too (anything made there after this moment stays). Continue?'
              : 'This REPLACES all data on this device with the backup. Continue?')) return;
            try { await importAll(JSON.parse(await f.text())); toast('Backup restored', 'gold'); } catch (err) { toast(String(err), 'bad'); }
            e.target.value = '';
          }} />
          <Button variant="danger" onClick={async () => { if (confirm(syncing ? 'Erase EVERYTHING on this device and stop syncing here? The encrypted cloud copy and your other device are not touched.' : 'Erase EVERYTHING on this device?') && confirm('Really? Export a backup first.')) { await db.delete(); location.reload(); } }}>Reset app</Button>
        </div>
              <div className="mt-3 flex flex-col gap-1 text-sm">
          <p>Last backup from this device: {lastDays === null ? 'none yet' : lastDays === 0 ? 'today' : `${lastDays} day${lastDays === 1 ? '' : 's'} ago`}.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={kept ? 'text-ok' : 'text-ink/70'}>{kept === undefined ? 'Checking storage…' : kept ? 'Storage: kept on this device (the browser won’t clear it to free space).' : kept === null ? 'Storage: this browser can’t say whether it keeps the data. Keep backups and sync on.' : 'Storage: the browser may clear it when space runs low. Install the app, or ask again.'}</span>
            {kept === false && <Button variant="ghost" onClick={async () => setKept(await keepData())}>Ask to keep the data</Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}

/** The ticker's lines are the user's own: one per line. Empty brings back the rules from the plan. */
function Inscriptions() {
  const row = useLiveQuery(async () => (await db.settings.get('inscriptions')) ?? null);
  const [text, setText] = useState<string | null>(null);
  if (row === undefined) return null;
  const saved = ((row?.value as string[] | undefined) ?? []).join('\n');
  const save = () => {
    if (text === null) return;
    const lines = text.split('\n').map(l => l.trim().slice(0, 80)).filter(Boolean).slice(0, 24);
    if (lines.join('\n') !== saved) setSetting('inscriptions', lines);
    setText(null);
  };
  return (
    <label className="mt-2 flex flex-col gap-1 font-display text-[13px] text-lav">
      Your lines on the ticker, one per line
      <textarea rows={5} value={text ?? saved} onChange={e => setText(e.target.value)} onBlur={save} placeholder={DEFAULT_INSCRIPTIONS.join('\n')}
        className="mac-inset w-full bg-white p-3 font-sans text-sm text-ink outline-none placeholder:text-ink/35" />
      <span className="font-sans text-xs text-ink/60">Rules, lyrics, a sentence you wrote. Saved when you leave the box, on both devices. Empty shows the rules from your plan.</span>
    </label>
  );
}

/** The user's own site: a link in the menu. The two stay separate in voice and look; this is only a door. */
function SiteLink() {
  const row = useLiveQuery(async () => (await db.settings.get('site')) ?? null);
  if (row === undefined) return null;
  const save = (v: string) => {
    const t = v.trim();
    const url = t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
    if (url !== ((row?.value as string | undefined) ?? '')) setSetting('site', url);
  };
  return (
    <label className="mt-3 flex flex-col gap-1 font-display text-[13px] text-lav">
      Your site (a link in the menu)
      <Input type="url" inputMode="url" autoCapitalize="none" defaultValue={(row?.value as string | undefined) ?? ''} placeholder="www.joseshota.net" onBlur={e => save(e.target.value)} />
    </label>
  );
}
