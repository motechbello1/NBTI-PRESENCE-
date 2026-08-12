export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        archive: "#101814",
        ledger:  "#F4F6F2",
        rule:    "#CAD1CB",
        bureau:  "#176B4A",
        review:  "#A05E12",
        refusal: "#B33A32",
        // Legacy semantic aliases remain while screens are migrated.
        ink:    "#F4F6F2",
        panel:  "#F4F6F2",
        raised: "color-mix(in srgb, #CAD1CB 34%, #F4F6F2)",
        line:   "#CAD1CB",
        paper:  "#101814",
        muted:  "color-mix(in srgb, #101814 62%, #F4F6F2)",
        clear:  "#176B4A",
        hold:   "#A05E12",
        deny:   "#B33A32",
        beam:   "#176B4A",
      },
      fontFamily: {
        display: ['Literata Variable', 'Georgia', 'serif'],
        sans:    ['IBM Plex Sans Variable', 'Arial', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
