/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        subtle: token('subtle'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        brand: { DEFAULT: token('brand'), soft: token('brand-soft'), ink: token('brand-ink') },
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
        info: token('info'),
      },
      borderRadius: { xl: '12px', '2xl': '16px', '3xl': '22px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.05), 0 1px 1px rgb(15 23 42 / 0.03)',
        lift: '0 10px 30px -10px rgb(15 23 42 / 0.18), 0 4px 10px -6px rgb(15 23 42 / 0.10)',
        glow: '0 8px 30px -8px rgb(var(--brand) / 0.55)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(0.16, 1, 0.3, 1)', std: 'cubic-bezier(0.2, 0, 0, 1)' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'gradient-pan': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        float: 'float 6s ease-in-out infinite',
        'gradient-pan': 'gradient-pan 14s ease infinite',
      },
    },
  },
  plugins: [],
};
