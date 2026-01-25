export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Spline Sans"', 'sans-serif']
      },
      colors: {
        ink: {
          950: '#0b0b0b',
          900: '#141414',
          800: '#1f1f1f',
          700: '#2a2a2a',
          200: '#d4d4d4',
          100: '#f0f0f0'
        },
        sea: {
          500: '#1f8a70',
          400: '#34b99a',
          300: '#66d3b7'
        },
        sun: {
          500: '#f4a259',
          400: '#f6b271',
          300: '#f7c58d'
        }
      },
      boxShadow: {
        card: '0 12px 30px rgba(0, 0, 0, 0.08)'
      },
      backgroundImage: {
        "mesh": "radial-gradient(circle at 20% 20%, rgba(52, 185, 154, 0.15), transparent 45%), radial-gradient(circle at 80% 0%, rgba(244, 162, 89, 0.18), transparent 45%), radial-gradient(circle at 30% 80%, rgba(44, 122, 105, 0.16), transparent 50%)"
      }
    }
  },
  plugins: []
};
