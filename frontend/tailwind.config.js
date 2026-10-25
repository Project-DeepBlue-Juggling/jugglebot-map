/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based dark mode (ADR 0017). ThemeProvider toggles the `dark`
  // class on <html>; every dark: variant activates when it is present.
  darkMode: 'class',
  theme: {
    extend: {
      // The item drawer's surface tokens (index.css :root / .dark).
      colors: {
        dr: {
          bg: 'var(--dr-bg)',
          border: 'var(--dr-border)',
          strong: 'var(--dr-border-strong)',
          hi: 'var(--dr-text-hi)',
          body: 'var(--dr-text-body)',
          med: 'var(--dr-text-med)',
          lo: 'var(--dr-text-lo)',
          code: 'var(--dr-code-bg)',
          link: 'var(--dr-link)',
          focus: 'var(--dr-focus)',
        },
      },
    },
  },
  plugins: [],
};
