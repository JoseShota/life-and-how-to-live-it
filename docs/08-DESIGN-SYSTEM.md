# 08 · Design System: vaporwave × Win95 × Internet Archive

*Life and How to Live It* should feel like a personal homepage from 1998 that is also a Windows 95 desktop, set at a vaporwave sunset. It's nostalgic and a bit funny, but **always readable on a tablet**.

## Mood
- **Vaporwave:** night sky that turns into a pink sunset, a striped sun, a cyan perspective grid, neon pink and cyan text glow, chrome gradient headings.
- **Win95 / 98:** every content block is a **window** with a gradient title bar and `_ □ ×` controls. Bevelled 3D buttons. A **taskbar** with a **Start** button, a Start menu with a vertical banner, and a clock. "It's now safe to go to sleep."
- **Internet Archive / Geocities:** the **Life Archive** page with "Saved N times between…" and a calendar of daily snapshots, a scrolling **marquee** ticker, a **visitor counter** (lifetime XP), "Best viewed in Netscape Navigator", a webring, 🚧 *under construction* empty states, and a guestbook (today's log).

## Tokens (`tailwind.config.js`)
| Token | Hex | Use |
|---|---|---|
| `bg` | `#130824` | Page background |
| `panel` / `panel2` | `#1d1036` / `#2a1850` | Window body / inset areas |
| `line` | `#4a2f7d` | Borders, dividers |
| `xp` | `#ff71ce` | Primary: hot pink (buttons, XP, active tab) |
| `cyan` | `#01cdfe` | Secondary: electric cyan (links, info, focus ring) |
| `lav` | `#b967ff` | Labels, subtitles |
| `gold` | `#fffb96` | Coins (¢), money actions |
| `ok` | `#05ffa1` | Done, positive money |
| `hp` | `#ff4d6d` | Danger, debt, overdue |
| `silver` | `#c0c0c0` | Win95 chrome (Start button, title bar controls) |

## Type
| Class | Font | Use |
|---|---|---|
| `font-display` | **VT323** | Window titles, big numbers, timer, page titles |
| `font-sans` (default) | **IBM Plex Mono** | Body text, forms |
| `font-pixel` | **Press Start 2P** | Tiny chrome only (`_ □ ×`). Never for reading |
| `font-serif` | Times New Roman | Archive text, footer (old-web feel) |

## Components & CSS classes
- `<Card title="NAME.EXT">` is a window. **Name windows like files**, in caps with an extension and a symbol: `⚔ QUESTS_TODAY.TXT`, `♥ ROUTINE.BAT`, `▤ ACCOUNTS.DIR`, `⌛ SNAPSHOTS.IDX`. Leave out `title` for a plain bevelled stat panel.
- `<PageTitle sub="FILE.EXT · description">` gives a chrome gradient title with a blinking cursor.
- `.bevel-out` raised, `.bevel-in` sunken (inputs, active tab, checked boxes), `.bevel-btn` for buttons.
- `.titlebar` (pink → lavender → cyan gradient), `.titlebar-dim` for inactive.
- `<Bar>` is the chunky Win95 progress bar (segmented). `<Ring>` glows in its color.
- `.neon-pink`, `.neon-cyan` for glowing text, `.chrome-text` for the gradient title.
- `.marquee`, `.blink`, `.scanlines`, `.vapor-sky` for atmosphere.
- **Square corners everywhere** (no `rounded-*`), except the round capture dots in the archive calendar.

## Voice
Lowercase, spaced-out subtitles (`a personal operating system · est. 2026`). File names for windows. Old-web jokes are welcome in empty states and confirmations, but **never in numbers or money**: those stay clear.

## Accessibility guardrails
- Body text ≥ 14 px, tap targets ≥ 40 px, contrast ≥ 4.5:1 for text (pink/cyan/mint on `panel` pass).
- Subtitles sit on a dark backing so they stay readable over the sun.
- `prefers-reduced-motion` turns off the marquee, blinking, and toast/pop animations (see `index.css`).
- Scanlines stay at low opacity and never block input (`pointer-events: none`).
