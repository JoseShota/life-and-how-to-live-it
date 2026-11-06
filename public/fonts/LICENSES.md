# Font licences

All fonts are self-hosted so the installed app works offline and makes no third-party requests.
The `.woff2` files are unmodified downloads from Google Fonts (except ChicagoFLF), split by Google's
`latin` / `latin-ext` unicode ranges. The `@font-face` rules are in `src/index.css`.

| Font | Files | Licence | Source |
|---|---|---|---|
| ChicagoFLF (Robin Casady) | `ChicagoFLF.woff2` | Public domain. The author: "I created ChicagoFLF and CheckboxFLF. You are free to use them as you wish. I consider those two in the public domain." | Bundled via system.css; statement mirrored in pkgsrc `wip/casady-fonts` |
| Cinzel (Natanael Gama) | `cinzel-*-var.woff2` (variable, 500–700) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Cinzel |
| Courier Prime (Alan Dague-Greene) | `courier-prime-*.woff2` | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Courier+Prime |
| Special Elite (Astigmatic) | `special-elite-*.woff2` | Apache License 2.0 | https://fonts.google.com/specimen/Special+Elite |
| DotGothic16 (Fontworks) | `dotgothic16-subset-400.woff2` | SIL Open Font License 1.1 | https://fonts.google.com/specimen/DotGothic16 |

## Updating the DotGothic16 subset

The full Japanese font is several MB, so only the kanji the UI uses are shipped (about 2 kB).
`tests/fonts.test.ts` fails if `src/` uses a CJK character the subset doesn't cover. To regenerate:

1. Collect every character the UI shows in `font-jp` (e.g. `APP_NAME_JP` and the `jp` labels in `src/components/Layout.tsx`, and `PageTitle jp="…"` in `src/pages/`).
2. Request the CSS with a desktop Chrome `User-Agent` so Google returns woff2:
   `https://fonts.googleapis.com/css2?family=DotGothic16&display=swap&text=<url-encoded characters>`
3. Download the `src: url(…)` file over `public/fonts/dotgothic16-subset-400.woff2` and copy the new `unicode-range` into the DotGothic16 `@font-face` in `src/index.css`.
