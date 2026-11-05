/** @type {import('tailwindcss').Config} */
// "Life and How to Live It" — vaporwave × Win95 × Internet Archive design tokens.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        display: ['VT323', '"IBM Plex Mono"', 'monospace'],
        pixel: ['"Press Start 2P"', 'VT323', 'monospace'],
        serif: ['"Times New Roman"', 'Times', 'serif']
      },
      colors: {
        bg: '#130824',        // midnight
        panel: '#1d1036',     // window body
        panel2: '#2a1850',    // inset areas
        line: '#4a2f7d',      // borders
        xp: '#ff71ce',        // hot pink (primary)
        cyan: '#01cdfe',      // electric cyan
        lav: '#b967ff',       // lavender
        gold: '#fffb96',      // vapor yellow (coins)
        hp: '#ff4d6d',        // danger
        ok: '#05ffa1',        // mint
        silver: '#c0c0c0'     // Win95 chrome
      },
      boxShadow: {
        glow: '0 0 18px -2px rgba(255,113,206,.65)',
        cyanglow: '0 0 18px -2px rgba(1,205,254,.6)'
      }
    }
  },
  plugins: []
};
