import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // PRD §6.1: navy/slate backgrounds, indigo accents, green/amber/red for status
      colors: {
        // Background palette
        background: {
          DEFAULT: '#0f172a', // navy-900
          secondary: '#1e293b', // slate-800
          tertiary: '#334155', // slate-700
        },
        // Accent palette
        accent: {
          DEFAULT: '#6366f1', // indigo-500
          hover: '#818cf8', // indigo-400
          muted: '#3730a3', // indigo-800
        },
        // Status palette (PRD §3.6 color codes)
        status: {
          proceed: '#22c55e', // green-500
          'proceed-bg': '#14532d', // green-900
          'further-review': '#f59e0b', // amber-500
          'further-review-bg': '#78350f', // amber-900
          pass: '#ef4444', // red-500
          'pass-bg': '#7f1d1d', // red-900
        },
        // Text palette
        foreground: {
          DEFAULT: '#f1f5f9', // slate-100
          muted: '#94a3b8', // slate-400
          subtle: '#64748b', // slate-500
        },
        // Border palette
        border: {
          DEFAULT: '#334155', // slate-700
          muted: '#1e293b', // slate-800
        },
      },
      fontFamily: {
        // PRD §6.1: monospaced font for all financial figures and scores
        mono: ['JetBrains Mono', 'GeistMono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
