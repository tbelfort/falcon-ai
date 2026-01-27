module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 rgba(0, 0, 0, 0)' },
          '50%': { boxShadow: '0 12px 28px rgba(0, 0, 0, 0.08)' },
        },
      },
      animation: {
        'float-in': 'floatIn 500ms ease-out',
        glow: 'glow 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
