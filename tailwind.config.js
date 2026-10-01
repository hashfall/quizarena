/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#07111f',
        panel: '#0b1a2e',
        line: '#1d3554',
        cyan: '#47d7ff',
        violet: '#7c5cff'
      }
    }
  },
  plugins: []
}
