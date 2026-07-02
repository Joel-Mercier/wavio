// @ts-check

import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";

// https://astro.build/config
export default defineConfig({
  fonts: [
    {
      name: "Inter",
      cssVariable: "--font-inter",
      provider: fontProviders.google(),
      weights: [400, 500, 600, 700, 800, 900],
      styles: ["normal"],
      subsets: ["latin", "cyrillic"],
    },
    {
      name: "Noto Sans SC",
      cssVariable: "--font-noto-sc",
      provider: fontProviders.google(),
      weights: [400, 500, 600, 700, 800, 900],
      styles: ["normal"],
      subsets: ["latin", "chinese-simplified"],
    },
  ],

  i18n: {
    locales: ["en", "fr", "ru", "zh-cn"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [],
});
