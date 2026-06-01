/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0f14',
        surface: '#161921',
        border: '#1e2330',
        accent: {
          green: '#00e5a0',
          blue: '#00b8ff',
          warn: '#ffb300',
          danger: '#ff4757',
        },
        text: {
          primary: '#e8eaf0',
          muted: '#6b7280',
        },
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        ui: ['Syne', 'sans-serif'],
      },
      keyframes: {
        'bounce-in': {
          '0%': { transform: 'translateX(-50%) translateY(20px)', opacity: '0' },
          '60%': { transform: 'translateX(-50%) translateY(-4px)', opacity: '1' },
          '100%': { transform: 'translateX(-50%) translateY(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'bounce-in': 'bounce-in 0.35s ease-out forwards',
        'fade-in':   'fade-in 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
