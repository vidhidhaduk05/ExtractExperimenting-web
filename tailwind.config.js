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
          black: "#000000",
          cream: "#ECE9E2",
          paper: "#FAF9F3",
          yellow: "#E9ED4C",
          orange: "#FF9400",
          green: "#75A025",
          pink: "#FD9BED",
          blue: "#0279EE",
        },
        rob: {
          low: "#75A025",
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
        sans: ['"Liberation Sans"', '"Arimo"', '"DejaVu Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
