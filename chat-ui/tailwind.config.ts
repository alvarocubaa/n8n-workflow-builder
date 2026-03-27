import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-figtree)', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Guesty Teal — primary brand palette
        guesty: {
          50:  '#EEFAD0', // Palest green — subtle highlights
          100: '#BCE5E5', // Lighter teal — card backgrounds
          200: '#8CBEBE', // Light teal — hover, secondary
          300: '#14665F', // Mid teal — primary actions, buttons
          400: '#072C23', // Darkest teal — headings, primary dark
        },
        // Secondary — navy accent
        navy: {
          50:  '#EBF0FF', // Lightest blue
          100: '#9EBCFF', // Light blue
          200: '#5071E6', // Blue accent
          300: '#0E0740', // Deep navy
        },
        // Secondary — coral/warm accent
        coral: {
          50:  '#FFE3E3', // Pale coral
          100: '#FFB4AD', // Light coral
          200: '#FA877D', // Coral accent
          300: '#5F1632', // Rose/burgundy — destructive
        },
        // Warm neutrals
        warm: {
          50:  '#F7F5F2', // Warm cream — page background
          100: '#E9E2D5', // Warm beige — borders, dividers
        },
        // Keep brand alias for backward compat during transition
        brand: {
          50:  '#EEFAD0',
          500: '#14665F',
          600: '#0f5c55',
          700: '#072C23',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
