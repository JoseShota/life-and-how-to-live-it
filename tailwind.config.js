/** @type {import('tailwindcss').Config} */
// Life and How to Live It — "Thermae" edition:
// a nostalgic, liminal, dreamcore Greek bathhouse, run on a Macintosh, logged on a typewriter.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Courier Prime"', 'ui-monospace', 'monospace'],       // body: typewriter (Beat)
        display: ['ChicagoFLF', '"Courier Prime"', 'monospace'],      // Mac System 6 chrome + numbers
        greek: ['Cinzel', '"Times New Roman"', 'serif'],              // inscriptions, page titles
        type: ['"Special Elite"', '"Courier Prime"', 'monospace'],    // worn typewriter, the scroll
        jp: ['"DotGothic16"', 'monospace'],                           // katakana subtitles
        pixel: ['ChicagoFLF', 'monospace'],
        serif: ['"Times New Roman"', 'Times', 'serif']
      },
      colors: {
        // "Thermae" liminal palette: an empty Greek bathhouse at 4 p.m. in a dream.
        ink: '#2b3437',       // soft charcoal (never pure black)
        paper: '#fbf8ef',     // typewriter paper
        bg: '#e4ebe7',        // haze
        panel: '#fbfaf6',     // window body (warm marble white)
        panel2: '#eef3f0',    // inset rows (pale tile)
        line: '#2b3437',
        xp: '#9c4a57',        // dusty rose, text-safe
        pink: '#ecc7c0',      // dusty rose fill
        cyan: '#2f716b',      // pool teal, text-safe
        mint: '#a6d9d1',      // pool water fill
        lav: '#615d8a',       // faded violet labels
        sky: '#cfe2e8',
        gold: '#82652a',      // ochre text (drachmae)
        laurel: '#e5d6a1',    // fluorescent cream / ochre fill
        hp: '#a8383a',
        ok: '#2f7a5f',
        marble: '#ece6da',
        tile: '#d6dfdb',      // grout
        silver: '#d4d9d6'
      },
      boxShadow: {
        mac: '3px 3px 0 0 #2b3437',
        glow: '0 0 0 3px #a6d9d1, 3px 3px 0 3px #2b3437',
        dream: '0 0 40px 6px rgba(255,255,255,.8)'
      }
    }
  },
  plugins: []
};
