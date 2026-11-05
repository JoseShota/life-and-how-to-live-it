/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif']
      },
      colors: {
        bg: '#0b0f1a',
        panel: '#121829',
        panel2: '#1a2238',
        line: '#26304d',
        xp: '#8b5cf6',
        gold: '#f5b83d',
        hp: '#ef4444',
        ok: '#22c55e'
      },
      boxShadow: { glow: '0 0 24px -4px rgba(139,92,246,.55)' }
    }
  },
  plugins: []
};
