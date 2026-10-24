/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based dark mode (ADR 0017). ThemeProvider toggles the `dark`
  // class on <html>; every dark: variant activates when it is present.
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
