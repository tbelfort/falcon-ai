/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Sora"', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular'],
      },
      boxShadow: {
        glow: '0 12px 30px -18px rgba(15, 23, 42, 0.5)',
      },
      colors: {
        ink: {
          900: '#0f172a',
          800: '#111c32',
          700: '#1f2a44',
          600: '#334155',
          300: '#94a3b8',
        },
        mist: '#f8fafc',
        sky: '#e0f2fe',
        coral: '#fb7185',
        moss: '#22c55e',
        amber: '#f59e0b',
      },
    },
  },
  plugins: [],
};
