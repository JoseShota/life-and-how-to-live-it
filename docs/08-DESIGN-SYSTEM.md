# 08 · Design System: "Thermae" edition

*Life and How to Live It* is an **empty Greek bathhouse at four in the afternoon, inside a dream**. Pale tiled walls, a colonnade whose arches open onto a washed-out sky, still pool water, a real marble head resting by the edge. The interface sits on top like an old Macintosh someone left running there, and the day is logged on a typewriter.

Nostalgic · liminal · dreamcore · Greek. Quiet, never loud.

| Ingredient | What we take | Where it lives |
|---|---|---|
| **Liminal space** | Tiled walls with grout lines, soft overhead light, vignette, haze, a still pool with slow caustics, an empty floor. Nobody is here | `.thermae-wall`, `.thermae-floor`, `.thermae-pool`, `.thermae-haze` |
| **Greek / classical** | A Doric colonnade in front of arches (see "The colonnade"), a real marble head (natural photo, no filter), Cinzel inscriptions, Greek-key bands, Delphic maxims, Roman-numeral levels, classical ranks, drachmae, the Agora, the Hall of Laurels | `Colonnade.tsx`, `.thermae-bust`, `.inscription`, `.marble-text`, `.meander` |
| **Dreamcore** | Arches open to a pale dream sky with soft clouds, drifting sparkles. The room carries the mood; the words don't have to | `#dreamsky` pattern, `.sparkle` |
| **Macintosh System 6** | Pinstriped title bars, close box, Chicago font, rounded-rect buttons with a hard shadow, menu bar | `.mac-*`, `MenuBar`, `Card`, `Modal` |
| **Beat Generation** | Courier Prime / Special Elite type, The Scroll (continuous paper), the Cut-Up poem | `.scroll-paper`, `font-type`, `src/lib/cutup.ts` |

## Palette (`tailwind.config.js`)
| Token | Hex | Role |
|---|---|---|
| `ink` / `line` | `#2b3437` | Soft charcoal: text, borders, shadows. Never pure black |
| `bg` | `#e4ebe7` | Haze |
| `panel` / `panel2` | `#fbfaf6` / `#eef3f0` | Warm marble white windows / pale-tile rows |
| `tile` | `#d6dfdb` | Grout |
| `mint` / `cyan` | `#a6d9d1` / `#2f716b` | Pool water **fill** / teal **text** |
| `pink` / `xp` | `#ecc7c0` / `#9c4a57` | Dusty rose **fill** / rose **text** |
| `laurel` / `gold` | `#e5d6a1` / `#82652a` | Fluorescent cream **fill** / ochre **text** (drachmae) |
| `lav` | `#615d8a` | Faded violet labels |
| `ok` / `hp` | `#2f7a5f` / `#a8383a` | Positive / danger |
| `marble`, `sky`, `paper`, `silver` | | Decoration |

Rule: **fills use the pale tokens (mint, pink, laurel), text uses the deep ones (cyan, xp, gold, ok, ink)**, so contrast stays ≥ 4.5:1. Saturation stays low everywhere. If a color feels "neon", it's wrong.

## No emoji, ever
All icons are **hand-drawn line glyphs** in `src/components/glyphs.ts`, rendered by `<Glyph name="owl" />`.
- 24×24 grid, single 1.6 px stroke, round caps, drawn with classical motifs: owl (teaching), spindle (Weaving), amphora (freelance), cog (AI), mask (video), quill (writing), temple (website), drachma (wealth), sunrise, moon, discus, wave, scroll, anvil, scales, lamp, laurel, Vergina star, and more.
- Data stores a glyph **name** in `icon` (schema v2 migrated old emoji). Pickers use `<IconPicker>`.
- `tests/legacy.test.ts` fails the build if any emoji appears in `src/`.
- To add a glyph: draw it in the DSL at the top of `glyphs.ts` (path / circle / rect / ellipse), add it to `PICKABLE` if users can choose it, and check it on the Agora "+ Reward" picker.

## Type
All fonts are **self-hosted** in `public/fonts/` (licences in `public/fonts/LICENSES.md`) and precached by the service worker, so the installed app looks the same offline. Never link a font CDN; `tests/fonts.test.ts` checks this. DotGothic16 ships only the kanji the UI uses, so adding a new `jp` label means regenerating that subset (steps in `LICENSES.md`).

| Class | Font | Use |
|---|---|---|
| `font-display` | ChicagoFLF | Menu bar, window titles, buttons, numbers |
| `font-sans` | Courier Prime | Body |
| `.inscription` / `font-greek` | Cinzel | Page titles, maxims, levels |
| `font-type` | Special Elite | The Scroll, poems, subtitles, dreamy copy |
| `font-jp` | DotGothic16 | Kanji subtitles |

## App icon
`public/icon.svg`: a tiled wall, one marble arch open onto a pale sky with a low rose sun, and still pool water. It's full-bleed with all art inside the central 80 %, so Android can crop it to any shape (maskable). The PNGs (`pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`) are rendered from the SVG. Re-render them whenever the SVG changes.

## Imagery
- `public/art/bust.webp` is the *Marble head of a youth*, Greek, 4th c. BCE (The Met, Open Access, public domain). It's the natural photo cut out with a soft edge and graded slightly cooler. **No dithering, no grain.**
- Add more with `python3 scripts/cutout.py photo.jpg public/art/name.webp`.

## Motion
Slow and ambient only: the pool caustics (14 s), the bust floating (11 s), sparkles twinkling, the maxims ticker (70 s). Everything stops under `prefers-reduced-motion`.

## Clarity rules (V-8)
- **Every themed name has a plain one**: Treasury · money, Agora · rewards, Archive · stats, Control · settings, Quests · tasks, Focus · timer, Review · weekly review (回顧, menu only: the tab bar keeps 7 tabs). It shows next to the kanji in page titles, in nav tooltips and in the menu.
- **Today starts with "Now"**: the current block of the ideal day and one primary action, above the rings. It must fit in the first viewport at 820 × 1180 and 1366 × 768. On teaching days the card title says so; travel, classroom and class blocks show what is happening and **no action** (nothing to tap on the road), prep blocks start focus on the teaching area's top quest.
- **Under "Now": at most one fresh-start banner, then the Season banner** (E-9). Both are plain cards with text and at most one primary action; a banner the user can close has an X of 40 × 40 px in its first line, not an empty action row.
- **Tap targets ≥ 40 px everywhere** (nav links are 40 px tall). The 15 px close box keeps its look but has a 43 px tap area.
- The ticker can be turned off in Control → Display, and stops under reduced motion.
- **Sync status (P2)** is one 40 px square next to the drachmae, only on a device that syncs: `cloudCheck` (teal) when synced, `cloud` when changes wait or while syncing (a slow pulse, none under reduced motion), `cloudOff` when offline, `cloudAlert` (rose `hp`) when it needs the user. Its label says what to do; tapping it opens Control → Sync.

## The colonnade
`Colonnade.tsx` (its own chunk: the tiled wall paints first, the columns a moment later) draws the far wall the way Doric columns are built, so it reads as stone and not as a diagram:
- **Shaft:** narrows upward with a slight swell (entasis); a left-lit marble gradient; twenty flutes, of which the facing ones are drawn, bunching toward the edges as they turn away, each dark on its left wall and lit on its right; drum joints; faint veining (`#vein`, on the shafts only).
- **Capital:** necking rings, the cushion (echinus), the square slab (abacus). No base: Doric columns stand on the step.
- **Above:** architrave, a frieze with a triglyph over each column and each bay, cornice.
- **It stands on the floor on every screen.** The wall's height is measured from the viewport (`floorTop()` in `Colonnade.tsx` mirrors `.thermae-floor`; change them together). A taller screen gets larger columns, up to 1.4 times, then taller shafts.
- Light comes from the upper left everywhere (the bust, the column shadows on the wall, the arch reveals). Keep it that way when adding to the room.

## Room to breathe
The background is part of the app, not wallpaper under it.
- **Windows roll up.** Tapping a titled window's bar rolls it up to the bar (WindowShade); the close box fills in. The choice is kept per device (`localStorage` key `shade`, by window title or `id`; not synced, not in backups). A window whose title changes needs an `id`. On Today, The Ideal Day and the Cut-Up start rolled up: "Now" already says what the day's block is.
- **Just the room.** The eye in the menu bar puts every window away; tap anywhere to bring them back.
- **Pages end early.** `main` has a third of a screen of empty space after its last window, so the end of every page is the floor, the pool and the bust.
- **One quiet line per row.** A habit row shows its name and one line (the day's note, else the streak, else the plan). XP, minimum version and the editor are one tap away, on the row's sheet. A window has no second header strip unless it holds a control you use daily.
- Nothing is removed to get calm: sections are rolled up or moved one tap away.

## Voice
Plain and literal. Lowercase in subtitles. Plain Mac language for actions. **Numbers and money are always literal.** Coins are written `27 dr`.
- **No slogans.** No greetings that change with the hour, no borrowed maxims, no lines about dreams, universes or journeys. A subtitle says what the page is; an empty state says what is missing; a toast says what happened ("Logged", "Done", "Notice", "Laurel won").
- **The only maxims are the user's own.** The ticker shows the lines they wrote in Control → Display (synced setting `inscriptions`); until they write some, it shows rules from `00-MASTER-PLAN.md`, stated as rules.
- What stays: the Mac jokes (the shutdown sheet, the footer's Macintosh Plus and visitor counter). They are the app's own, not stock.
