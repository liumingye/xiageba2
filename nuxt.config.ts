export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
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
          content:
            "下歌吧, 音乐下载, FLAC, MP3, 无损音乐, 免费下载, 在线试听",
        },
        { name: "robots", content: "index, follow" },
        { name: "theme-color", content: "#0f172a" },
        { name: "author", content: "下歌吧" },
        { property: "og:site_name", content: "下歌吧" },
        { property: "og:type", content: "website" },
      ],
    },
  },
  routeRules: {
    "/admin/**": { ssr: false },
    "/": { ssr: true },
    "/music/**": { ssr: true },
    "/search": { ssr: true },
  },
});
