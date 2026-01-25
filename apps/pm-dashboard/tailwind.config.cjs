module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace']
      },
      colors: {
        ink: {
          50: '#f5f7fb',
          100: '#e7ecf4',
          200: '#c9d4e6',
          300: '#9fb3cf',
          400: '#6e87b1',
          500: '#486590',
          600: '#344a6f',
          700: '#28395a',
          800: '#1c2942',
          900: '#131b2c'
        },
        coral: {
          400: '#ff7a66',
          500: '#f35f4a'
        }
      }
    }
  },
  plugins: []
};
