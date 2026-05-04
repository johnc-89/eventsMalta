/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:     '#1a1f36',
          gold:     '#f5a623',
          cream:    '#fdf8f0',
          cyan:     '#22d3ee',
          teal:     '#0d9488',
          burgundy: '#9b1c1c',
        },
      },
      fontFamily: {
        heading: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        body:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
