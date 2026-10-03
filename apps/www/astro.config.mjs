// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';
import { defaultLocale, locales, localizedPath } from './src/i18n';

// https://astro.build/config
export default defineConfig({
  site: "https://synch.run",
  trailingSlash: "always",
  // Legal documents are shared in English; keep locale-prefixed links working.
  redirects: Object.fromEntries(
    locales.filter((locale) => locale !== defaultLocale).flatMap((locale) =>
      ["/terms/", "/privacy/"].map((path) => [localizedPath(locale, path), path]),
    ),
  ),
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !/\/billing(?:\/|$)/.test(new URL(page).pathname),
      i18n: {
        defaultLocale: "en",
        locales: {
          en: "en",
          ko: "ko",
          ja: "ja",
          "zh-cn": "zh-CN",
          "zh-tw": "zh-TW",
          de: "de",
        },
      },
    }),
  ],
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ko", "ja", "zh-cn", "zh-tw", "de"],
    routing: {
      prefixDefaultLocale: false
    }
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
