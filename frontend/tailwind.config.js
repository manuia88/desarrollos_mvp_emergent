/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'dmx-bg': '#06080F',
        'dmx-bg2': '#0D1017',
        'dmx-bg3': '#111827',
        'dmx-cream': '#F0EBE0',
        'dmx-indigo': '#6366F1',
        'dmx-indigo2': '#818CF8',
        'dmx-indigo3': '#a5b4fc',
        'dmx-rose': '#EC4899',
        'dmx-green': '#22C55E',
        'dmx-amber': '#F59E0B',
        'dmx-red': '#EF4444',
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        dm: ['DM Sans', 'sans-serif'],
      },
      borderRadius: {
        pill: '9999px',
        card: '22px',
        inner: '14px',
        chip: '10px',
      },
    },
  },
  plugins: [],
};
