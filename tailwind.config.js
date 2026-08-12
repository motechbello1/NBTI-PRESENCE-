export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink:    "#0A0F16",
        panel:  "#111A24",
        raised: "#17222E",
        line:   "#22303F",
        paper:  "#E6EDF3",
        muted:  "#8298AC",
        clear:  "#00A65A",
        hold:   "#E8A33D",
        deny:   "#E5484D",
        beam:   "#3DDC97",
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans:    ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
