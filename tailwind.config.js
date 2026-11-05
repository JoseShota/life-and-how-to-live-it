/** @type {import('tailwindcss').Config} */
// Life and How to Live It — "Floral Dream" edition:
// Macintosh System 6 × Floral Shoppe vaporwave × Greek marble × dreamcore × Beat typewriter.
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
        ink: '#1b1530',       // 1-bit black (slightly violet)
        paper: '#fdfaf3',     // typewriter paper
        bg: '#efe9f7',        // haze
        panel: '#ffffff',     // window body
        panel2: '#f6f0ff',    // inset / rows
        line: '#1b1530',      // 1-bit borders
        xp: '#e8399a',        // Floral Shoppe pink (text-safe)
        pink: '#ffb3dd',      // pink fills
        cyan: '#0e9c97',      // teal (text-safe)
        mint: '#7ff0d8',      // teal fills
        lav: '#6c4fc4',       // lavender (labels)
        sky: '#bfe3ff',
        gold: '#a87b00',      // coins / drachmae (text-safe)
        laurel: '#e9c46a',    // gold fills
        hp: '#d2264a',
        ok: '#0f8a6d',
        marble: '#ece6dc',
        silver: '#d9d9d9'
      },
      boxShadow: {
        mac: '3px 3px 0 0 #1b1530',
        glow: '0 0 0 3px #ffb3dd, 3px 3px 0 3px #1b1530',
        dream: '0 0 40px 6px rgba(255,255,255,.8)'
      }
    }
  },
  plugins: []
};
