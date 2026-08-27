/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A', 'ink-soft': '#4B5768',
        paper: '#F7F8F6', surface: '#FFFFFF',
        line: '#E4E2DC', 'line-soft': '#EEEDE8',
        pcb: '#0E7C6B', 'pcb-dark': '#0A5C4F', 'pcb-tint': '#E7F3F0',
        gold: '#C98A2C', 'gold-tint': '#FBF1E1',
        red: '#C4472F', 'red-tint': '#FBEBE7',
        adminbg: '#12161C', adminpanel: '#181D25', adminline: '#262C35',
        adminink: '#E7E9EC', 'adminink-soft': '#8B93A1',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: { DEFAULT: '11px', sm: '7px' },
    },
  },
  plugins: [],
};
