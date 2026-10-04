/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FAF8F5',
          deep: '#F2EFE9',
        },
        ink: {
          DEFAULT: '#111111',
          mid: '#444444',
          deep: '#000000',
          light: 'rgba(0, 0, 0, 0.06)',
        },
        peach: {
          DEFAULT: '#E8927C',
          light: '#FEF0EB',
          deep: '#C96A50',
        },
        border: {
          DEFAULT: '#E8E4DC',
          soft: '#F0ECE4',
        },
        surface: {
          hover: '#F5F2EC',
        },
        inktext: {
          DEFAULT: '#1A1814',
          muted: '#6B6660',
          faint: '#9E9890',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(26, 24, 20, 0.04)',
        panel: '0 1px 3px rgba(26, 24, 20, 0.04), 0 8px 24px rgba(26, 24, 20, 0.04)',
        btn: '0 2px 8px rgba(79, 70, 229, 0.25)',
        'btn-hover': '0 4px 16px rgba(79, 70, 229, 0.32)',
        logo: '0 4px 12px rgba(79, 70, 229, 0.25)',
        modal: '0 24px 64px rgba(24, 33, 38, 0.18)',
        score: '0 8px 32px rgba(79, 70, 229, 0.2)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'loading-bar': {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(200%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      animation: {
        rise: 'rise 380ms cubic-bezier(0.16, 1, 0.3, 1) both',
        fade: 'fade 260ms ease both',
        'loading-bar': 'loading-bar 1.2s ease-in-out infinite',
      },
      transitionDuration: {
        120: '120ms',
        180: '180ms',
        400: '400ms',
      },
      backgroundImage: {
        app: 'radial-gradient(ellipse 70% 40% at 90% 0%, rgba(79, 70, 229, 0.06), transparent), radial-gradient(ellipse 50% 50% at 0% 100%, rgba(232, 146, 124, 0.08), transparent)',
        'login-panel': 'linear-gradient(145deg, #000000 0%, #222222 60%, #444444 100%)',
      },
    },
  },
  plugins: [],
}
