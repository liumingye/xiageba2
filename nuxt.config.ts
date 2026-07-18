import legacy from "@vitejs/plugin-legacy";
import path from "path";

// 1. 判断是否为开发环境
const isDev = process.env.NODE_ENV === "development";

export default defineNuxtConfig({
  compatibilityDate: "2026-06-01",
  devtools: {
    enabled: true,
  },
  experimental: {
    viewTransition: true,
  },
  sourcemap: false,
  modules: [
    "@nuxtjs/tailwindcss",
    "@pinia/nuxt",
    "nuxt-api-shield",
    "@teages/nuxt-legacy",
  ],
  css: ["~/assets/css/main.css"],
  app: {
    baseURL: "/",
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
      isr: 300,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
      },
    },
    "/music/**": {
      ssr: true,
      isr: 60 * 60 * 24 * 30,
    },
    "/search": {
      ssr: true,
    },
    "/img/**": {
      static: true,
      headers: {
        "Cache-Control":
          "public, max-age=864000, stale-while-revalidate=864000",
      },
    },
  },
  nuxtApiShield: {
    limit: {
      max: 30,
      duration: 60,
      ban: 60,
    },
    delayOnBan: true,
    errorMessage: "请求过于频繁，请稍后再试",
    retryAfterHeader: false,
    routes: [
      {
        path: "/api/music/search",
        max: 30,
        duration: 60,
        ban: 120,
      },
      {
        path: "/api/music/recent",
        max: 15,
        duration: 60,
        ban: 30,
      },
      {
        path: "/api/music/feedback",
        max: 10,
        duration: 300,
        ban: 60,
      },
      {
        path: "/api/admin/login",
        max: 5,
        duration: 60,
        ban: 60,
      },
      {
        path: "/music/*",
        max: 120,
        duration: 300,
        ban: 90,
      },
      {
        path: "/api/source/geturl",
        max: 10,
        duration: 30,
        ban: 120,
      },
      {
        path: "/api/source/tree",
        max: 10,
        duration: 30,
        ban: 120,
      },
      {
        path: "/api/source/search",
        max: 30,
        duration: 60,
        ban: 120,
      },
    ],
    log: {
      path: "",
      attempts: 0,
    },
    security: {
      // 不使用CDN请修改成false
      trustXForwardedFor: true,
    },
  },
  nitro: {
    compressPublicAssets: true,
    storage: {
      shield: {
        driver: "memory",
      },
    },
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      "*/30 * * * *": ["source:clean_temp"],
      "*/5 * * * *": ["source:check_account"],
    },
  },
  vite: {
    build: {
      // target: ["es2015"], // 指定目标浏览器版本,
    },
    plugins: [
      legacy({
        modernTargets: "last 3 years, not dead", // 兼容的浏览器版本
        renderLegacyChunks: false,
        modernPolyfills: true,
      }) as any,
    ],
    optimizeDeps: {
      include: ["@lucide/vue", "@vueuse/core", "pinia", "qrcode"],
    },
  },
  alias: {
    // 强制把代码里对该子包的引用，直接映射到它的 .mjs 文件上
    // 请将下面的包名和路径替换为你项目里的真实物理路径
    ...(isDev
      ? {
          "@netdisk-sdk/baidu-sdk": path.resolve(
            __dirname,
            "./packages/netdisk-sdk-js/packages/baidu-sdk/src",
          ),
          "@netdisk-sdk/quarkuc-sdk": path.resolve(
            __dirname,
            "./packages/netdisk-sdk-js/packages/quarkuc-sdk/src",
          ),
          "@netdisk-sdk/xunlei-sdk": path.resolve(
            __dirname,
            "./packages/netdisk-sdk-js/packages/xunlei-sdk/src",
          ),
          "@netdisk-sdk/utils": path.resolve(
            __dirname,
            "./packages/netdisk-sdk-js/packages/utils/src",
          ),
        }
      : {}),
  },
});
