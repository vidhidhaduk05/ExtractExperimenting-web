/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        palette: {
          periwinkle: "#88A0DC",
          amethyst: "#381A61",
          plum: "#7C4B73",
          coral: "#ED968C",
          crimson: "#AB3329",
          amber: "#E78429",
          gold: "#F9D14A",
        },
        phylo: {
          black: "#141413",
          cream: "#ECE9E2",
          paper: "#FAF9F3",
          surface: "#F2F1EB",
          card: "#FFFFFF",
          yellow: "#F9D14A",
          yellowDark: "#381A61",
          orange: "#E78429",
          green: "#7C4B73",
          pink: "#ED968C",
          blue: "#88A0DC",
          glow: "#FFF5C6",
          muted: "#6B665E",
          border: "rgba(20, 20, 19, 0.08)",
        },
        rob: {
          low: "#7C4B73",
          some: "#E78429",
          unclear: "#E78429",
          moderate: "#E78429",
          high: "#AB3329",
          serious: "#AB3329",
          critical: "#AB3329",
          noinfo: "#88A0DC",
          pending: "#CCCCCC",
        },
      },
      fontFamily: {
        serif: ['"Newsreader"', '"Signifier"', '"GT Sectra"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', '"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
