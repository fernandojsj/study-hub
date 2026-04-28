import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic surface tokens
        bg: {
          DEFAULT: '#09090b',   // zinc-950
          raised: '#18181b',    // zinc-900
          overlay: '#1c1c1f',
        },
        border: {
          DEFAULT: '#27272a',   // zinc-800
          strong: '#3f3f46',    // zinc-700
        },
        // Brand accent
        violet: {
          DEFAULT: '#8b5cf6',
          dim: '#7c3aed',
          muted: 'rgba(139,92,246,0.12)',
          glow: 'rgba(139,92,246,0.25)',
        },
        // Semantic feedback
        ok: {
          DEFAULT: '#10b981',
          muted: 'rgba(16,185,129,0.12)',
        },
        fail: {
          DEFAULT: '#f43f5e',
          muted: 'rgba(244,63,94,0.12)',
        },
        warn: {
          DEFAULT: '#f59e0b',
          muted: 'rgba(245,158,11,0.10)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        'glow-violet': '0 0 0 1px rgba(139,92,246,0.5), 0 0 20px rgba(139,92,246,0.15)',
        'glow-ok': '0 0 0 1px rgba(16,185,129,0.4)',
        'glow-fail': '0 0 0 1px rgba(244,63,94,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
        'pop': 'pop 120ms cubic-bezier(0.34,1.56,0.64,1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
