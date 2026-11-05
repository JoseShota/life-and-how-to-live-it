# 08 · Design System: "Floral Dream" edition

*Life and How to Live It* should feel like a **Macintosh Plus left on in a dream**. The screen is 1-bit black and white, a marble head floats over a pink-and-teal vaporwave sky, Greek inscriptions scroll past, and a Beat poet's typewriter keeps the log.

| Ingredient | What we take | Where it lives |
|---|---|---|
| **Macintosh Plus / System 6** | 1-bit windows, pinstriped title bars with a close box, the Chicago font, rounded-rect buttons with a hard shadow, the ✿ menu bar, "It is now safe to switch off your day" | `.mac-*` classes, `MenuBar`, `Card`, `Modal` |
| **Floral Shoppe-era vaporwave** | Pink + teal, a Greek marble head, a checkerboard floor in perspective, Japanese subtitles. *Inspired by, never copying, the album art* | `.dream-floor`, `.dream-bust`, `font-jp`, `pink`/`mint` tokens |
| **Greek / classical** | Cinzel inscriptions, Greek-key (meander) bands, Delphic maxims (ΓΝΩΘΙ ΣΑΥΤΟΝ, ΜΗΔΕΝ ΑΓΑΝ), Roman-numeral levels, classical ranks (Neophyte → Philosopher-King), drachmae ₯ as coins, the **Agora** reward market, the **Hall of Laurels** | `.inscription`, `.marble-text`, `.meander`, `roman()` |
| **Dreamcore** | Light pastel sky, drifting soft clouds, twinkling ✧, film grain, gentle uncanny copy ("this room is empty. it feels familiar.", "you have been here before") | `.dream-sky`, `.sparkle`, `.grain`, `Empty` |
| **Beat Generation** | Typewriter type (Courier Prime, Special Elite), **The Scroll** (today's log on continuous teletype paper, a nod to Kerouac), the **Cut-Up** poem built from your day (Burroughs/Gysin), lowercase spontaneous subtitles | `.scroll-paper`, `font-type`, `src/lib/cutup.ts` |

## Tokens (`tailwind.config.js`)
| Token | Hex | Use |
|---|---|---|
| `ink` / `line` | `#1b1530` | All 1-bit borders, text, hard shadows |
| `paper` | `#fdfaf3` | Typewriter paper |
| `bg` / `panel` / `panel2` | `#efe9f7` / `#fff` / `#f6f0ff` | Haze / windows / inset rows |
| `xp` | `#e8399a` | Pink **text** and accents |
| `pink` | `#ffb3dd` | Pink **fills** (primary buttons, dithered progress) |
| `cyan` / `mint` | `#0e9c97` / `#7ff0d8` | Teal text / teal fills |
| `lav` | `#6c4fc4` | Labels |
| `gold` / `laurel` | `#a87b00` / `#e9c46a` | Drachmae text / gold fills |
| `ok` / `hp` | `#0f8a6d` / `#d2264a` | Positive / danger |
| `marble`, `sky`, `silver` | | Decoration |

Rule: **fills use pastel tokens (`pink`, `mint`, `laurel`), text uses dark tokens (`xp`, `cyan`, `gold`, `ok`, `ink`)**, so text contrast stays ≥ 4.5:1.

## Type
| Class | Font | Use |
|---|---|---|
| `font-display` | **ChicagoFLF** (self-hosted, `public/fonts`) | Mac chrome: menu bar, window titles, buttons, numbers |
| `font-sans` (default) | **Courier Prime** | Body text, forms |
| `font-greek` / `.inscription` | **Cinzel** | Page titles, maxims ticker, level numerals |
| `font-type` | **Special Elite** | The Scroll, cut-up poems, subtitles, dreamy copy |
| `font-jp` | **DotGothic16** | Katakana/kanji subtitles (今日, 冒険, 宝庫…) |

## Components
- `<Card title="Plain Words">` is a System 6 window. Titles are short and plain ("Quests of the Day", "The Scroll"), not file names.
- `<PageTitle jp="今日" sub="lowercase typed line">Title</PageTitle>` renders kanji, a marble Cinzel title, a typed subtitle with a cursor, and a meander band.
- `<Button>`: `primary` = pink fill + default-button ring, `gold` = laurel + ring, `cyan` = mint, `ghost` = white, `danger` = white with red text. They invert on press, like a real Mac.
- `<Bar>` is a Mac progress bar with a **dithered pink** fill. `<Ring>` is a 1-bit double circle with a pastel stroke.
- `<Empty>` is a dreamcore empty room.
- `.mac-window`, `.mac-inset`, `.mac-btn`, `.mac-titlebar`, `.mac-close`, `.dither-pink`, `.dither-gray` live in `@layer components` so utilities (`bg-pink`, etc.) can override them.

## Imagery
- `public/art/bust.png` is the *Marble head of a youth*, Greek, 4th c. BCE (The Met, Open Access, public domain). It was converted to 1-bit with **Atkinson dithering** (the original MacPaint algorithm).
- To add more, pick an **Open Access** object from metmuseum.org (check the label) and run the dither script below. Keep images 1-bit (ink + white + transparent) so they match the System 6 look.

```bash
python3 scripts/dither.py input.jpg public/art/name.png 1b1530
```

## Voice
Lowercase, spontaneous, a little uncanny for subtitles and empty states ("the world still dreams. you rise."). Plain Mac language for actions ("Add", "Log time"). **Numbers and money are always clear and literal.**

## Accessibility guardrails
- Body text ≥ 15 px Courier Prime, tap targets ≥ 40 px, text contrast ≥ 4.5:1 (see the token rule).
- Subtitles sit on a white backing over the sky.
- `prefers-reduced-motion` stops clouds, bust float, sparkles, marquee, blink and pop.
- Grain and backdrop never take pointer events.

## Credits
See `CREDITS.md`.
