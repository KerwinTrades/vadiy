/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'veteran-blue': '#1E3A8A',
        'veteran-gold': '#D97706',
        'military-green': '#065F46',
        'veteran-red': '#DC2626',
      },
      fontFamily: {
        'military': ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'secure-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'typing': 'typing 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}; 