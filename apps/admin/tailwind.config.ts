import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Inspiro brand colours (from DESIGN.md)
        brand: {
          violet: '#5B21B6',
          'violet-bright': '#7C3AED',
          'violet-light': '#d3bbff',
          teal: '#0D9488',
          'teal-light': '#4fdbc8',
          amber: '#F59E0B',
          emerald: '#10B981',
          rose: '#E11D48',
        },
        surface: {
          DEFAULT: '#11131e',
          1: '#13162A',
          2: '#1A1F3A',
          3: '#1E2445',
          high: '#272935',
          highest: '#323440',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
