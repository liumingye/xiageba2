export default defineNuxtConfig({
  compatibilityDate: "2026-06-01",
  devtools: { enabled: true },
  sourcemap: false,
  modules: ["@nuxtjs/tailwindcss", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      title: "下歌吧 - 免费下载高品质MP3与FLAC无损音乐",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content:
            "下歌吧是一个免费高品质音乐下载平台，提供MP3与FLAC无损音乐下载、在线试听、歌词展示等功能。",
        },
        {
          name: "keywords",
          content: "下歌吧, 音乐下载, FLAC, MP3, 无损音乐, 免费下载, 在线试听",
        },
        { name: "robots", content: "index, follow" },
        { name: "theme-color", content: "#0f172a" },
        { name: "author", content: "下歌吧" },
        { property: "og:site_name", content: "下歌吧" },
        { property: "og:type", content: "website" },
      ],
    },
    pageTransition: { name: "page", mode: "out-in" },
  },
  features: {
    inlineStyles: false,
  },
  routeRules: {
    "/admin/**": { ssr: false },
    "/": {
      ssr: true,
      isr: 60,
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
    "/music/**": {
      ssr: true,
      isr: 60 * 60,
      headers: {
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400",
      },
    },
    "/search": {
      ssr: true,
      headers: {
        "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      },
    },
    "/api/music/**": {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
    "/api/music/search": {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      },
    },
    "/img/**": {
      static: true,
      headers: {
        "Cache-Control":
          "public, max-age=864000, stale-while-revalidate=864000",
      },
    },
  },
  nitro: {
    compressPublicAssets: true,
  },
  vite: {
    build: {
      target: "es2020",
    },
    optimizeDeps: {
      include: ["lucide-vue-next", "pinia", "qrcode"],
    },
  },
});
