/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {}, // <-- İşte sihirli değişiklik burada!
    autoprefixer: {},
  },
};

export default config;