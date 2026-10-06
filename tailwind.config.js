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
        phylo: {
          black: "#141413",
          cream: "#ECE9E2",
          paper: "#FAF9F3",
          surface: "#F2F1EB",
          card: "#FFFFFF",
          yellow: "#E9ED4C",
          yellowDark: "#62631E",
          orange: "#FF9400",
          green: "#10B981",
          pink: "#FD9BED",
          blue: "#0279EE",
          glow: "#FFF5C6",
          muted: "#6B665E",
          border: "rgba(20, 20, 19, 0.08)",
        },
        rob: {
          low: "#10B981",
          some: "#FF9400",
          unclear: "#FF9400",
          moderate: "#FF9400",
          high: "#E94444",
          serious: "#E94444",
          critical: "#B00000",
          noinfo: "#999999",
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
