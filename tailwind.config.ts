import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "#2563EB",
        builder: "#2563EB",
        retrofit: "#16A34A",
        private: "#EAB308",
      },
    },
  },
  plugins: [],
};
export default config;
