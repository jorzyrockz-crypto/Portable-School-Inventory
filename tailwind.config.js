/** @type {import('tailwindcss').Config} */
module.exports = {
  // Every class used by the app lives in index.html (markup + inline JS templates).
  content: ['./index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        // JetBrains Mono has no peso sign (₱); fall back to Inter for that glyph.
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', '"Inter Variable"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#1e1b4b',
        },
      },
    },
  },
  plugins: [],
};
