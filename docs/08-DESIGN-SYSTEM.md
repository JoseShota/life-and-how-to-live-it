# 08 · Design System: "Thermae" edition

*Life and How to Live It* is an **empty Greek bathhouse at four in the afternoon, inside a dream**. Pale tiled walls, a colonnade whose arches open onto a washed-out sky, still pool water, a real marble head resting by the edge. The interface sits on top like an old Macintosh someone left running there, and the day is logged on a typewriter.

Nostalgic · liminal · dreamcore · Greek. Quiet, never loud.

| Ingredient | What we take | Where it lives |
|---|---|---|
| **Liminal space** | Tiled walls with grout lines, soft overhead light, vignette, haze, a still pool with slow caustics, an empty floor. Nobody is here. Faint wall text: *you have been here before* | `.thermae-wall`, `.thermae-floor`, `.thermae-pool`, `.thermae-haze`, `.wall-whisper` |
| **Greek / classical** | A colonnade of arches with fluted columns, a real marble head (natural photo, no filter), Cinzel inscriptions, Greek-key bands, Delphic maxims, Roman-numeral levels, classical ranks, drachmae, the Agora, the Hall of Laurels | `Colonnade` in `Layout.tsx`, `.thermae-bust`, `.inscription`, `.marble-text`, `.meander` |
| **Dreamcore** | Arches open to a pale dream sky with soft clouds, drifting sparkles, uncanny gentle copy ("this room is empty. it feels familiar.") | `#dreamsky` pattern, `.sparkle`, `Empty` |
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

## Voice
Lowercase, calm, a little uncanny in subtitles and empty states. Plain Mac language for actions. **Numbers and money are always literal.** Coins are written `27 dr`.
