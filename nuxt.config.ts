import legacy from "@vitejs/plugin-legacy";
import path from "path";

// 1. 判断是否为开发环境
const isDev = process.env.NODE_ENV === "development";

export default defineNuxtConfig({
  compatibilityDate: "2026-06-01",
  devtools: {
    enabled: true,
  },
  sourcemap: {
    server: false,
    client: false,
  },
  modules: [
    "@nuxtjs/tailwindcss",
    "@pinia/nuxt",
    "@vite-pwa/nuxt",
    "nuxt-api-shield",
    "@teages/nuxt-legacy",
  ],
  pwa: {
    // 自动更新策略：检测到新版本时自动激活新的 Service Worker，无需用户手动刷新或确认
    registerType: "autoUpdate",

    // 需要被预缓存（Pre-cache）的静态资源列表（除了构建生成的资源外）
    includeAssets: [
      "favicon.ico",
      "offline.html", // 离线状态下显示的后备 HTML 页面
      "pwa/icon-192.png",
      "pwa/icon-512.png",
      "pwa/icon-maskable-512.png",
      "pwa/apple-touch-icon.png",
    ],

    // 应用清单配置（控制 PWA 安装到手机或桌面端后的外观和行为）
    manifest: {
      id: "/", // PWA 的唯一标识符，防止由于 start_url 改变导致生成两个应用
      name: "下歌吧 - 高品质音乐下载", // 应用的完整名称（安装时显示）
      short_name: "下歌吧", // 应用的简短名称（桌面图标下方显示）
      description: "免费下载高品质 MP3 与 FLAC 无损音乐", // 应用描述
      lang: "zh-CN", // 应用默认语言
      start_url: "/", // 用户点击桌面图标启动应用时的初始路由
      scope: "/", // 限制 PWA 导航控制的 URL 范围，"/" 代表整个站点
      display: "standalone", // 独立应用模式，隐藏浏览器地址栏和导航条，体验类似原生 App
      background_color: "#0a0a0a", // 应用启动页的背景颜色
      theme_color: "#0f172a", // 系统状态栏、标题栏的颜色
      categories: ["music", "entertainment"], // 应用分类（应用商店检索用）

      // 供不同设备、不同场景调用的应用图标
      icons: [
        {
          src: "/pwa/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any", // 默认用途，普通图标
        },
        {
          src: "/pwa/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/pwa/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable", // 可裁剪图标，适配安卓等系统的圆角或异形图标，确保核心图案不被切掉
        },
      ],
    },

    // Workbox 配置（底层 Service Worker 的运行核心）
    workbox: {
      cleanupOutdatedCaches: true, // 清理之前版本留下的旧缓存，释放存储空间
      clientsClaim: true, // 新的 Service Worker 激活后，立刻接管所有打开的页面
      skipWaiting: true, // 跳过等待，强制最新的 Service Worker 立即进入激活状态
      navigateFallback: null, // 禁用全局导航回退。因为下方 runtimeCaching 中对单页面做了精确的离线后备处理

      // 匹配需要通过 Workbox 自动打包并预缓存的文件类型后缀
      globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],

      // 运行时缓存策略（针对预缓存之外的动态请求）
      runtimeCaching: [
        {
          // 1. 图片资源缓存规则：匹配所有图片类型的请求
          urlPattern: ({ request }) => request.destination === "image",
          handler: "StaleWhileRevalidate", // 速度优先策略：直接从缓存读取旧数据秒开页面，同时在后台静默发起网络请求更新缓存
          options: {
            cacheName: "images", // 缓存空间名称
            cacheableResponse: { statuses: [0, 200] },
            expiration: {
              maxEntries: 100, // 最多缓存 100 张图片
              maxAgeSeconds: 60 * 60 * 24, // 缓存有效时间：1 天
            },
          },
        },
      ],
    },

    // 开发环境配置
    devOptions: {
      enabled: true, // 在开发模式（npm run dev）下禁用 PWA 功能，避免频繁的 Service Worker 缓存导致调试困难
    },
  },
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
      link: [
        { rel: "icon", href: "/favicon.ico", sizes: "any" },
        {
          rel: "apple-touch-icon",
          href: "/pwa/apple-touch-icon.png",
        },
        { rel: "manifest", href: "/manifest.webmanifest" },
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
    "/sw.js": {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    },
    "/manifest.webmanifest": {
      headers: {
        "Cache-Control": "public, max-age=86400",
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
