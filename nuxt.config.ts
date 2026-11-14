import path from "path";

export default defineNuxtConfig({
  compatibilityDate: "2026-06-01",
  modules: [
    "@comark/nuxt",
    "@nuxt/ui",
    "@pinia/nuxt",
    "@teages/nuxt-legacy",
    [
      "nuxt-api-shield",
      {
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
            path: "/api/admin/login",
            max: 5,
            duration: 60,
            ban: 60,
          },
          {
            path: "/api/music/search",
            max: 30,
            duration: 60,
            ban: 180,
          },
          {
            path: "/api/music/recent",
            max: 30,
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
            path: "/api/music/**",
            pattern: true,
            max: 120,
            duration: 300,
            ban: 90,
          },
          {
            path: "/api/source/geturl",
            max: 15,
            duration: 30,
            ban: 120,
          },
          {
            path: "/api/source/tree",
            max: 15,
            duration: 30,
            ban: 120,
          },
          {
            path: "/api/source/search",
            max: 30,
            duration: 60,
            ban: 180,
          },
          {
            path: "/api/ai-search",
            max: 10,
            duration: 30,
            ban: 120,
          },
          {
            path: "/api/novel/search",
            max: 30,
            duration: 60,
            ban: 120,
          },
          {
            path: "/api/novel/**",
            pattern: true,
            max: 60,
            duration: 60,
            ban: 60,
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
    ],
    [
      "@vite-pwa/nuxt",
      {
        // 自动更新策略：检测到新版本时自动激活新的 Service Worker，无需用户手动刷新或确认
        registerType: "autoUpdate",

        // 应用清单配置（控制 PWA 安装到手机或桌面端后的外观和行为）
        // Chrome 112+ / Edge 安装 PWA 的条件只有 manifest + HTTPS，不依赖 Service Worker，
        // 因此下方移除全部 workbox 缓存后，安装能力不受影响
        manifest: {
          id: "/", // PWA 的唯一标识符，防止由于 start_url 改变导致生成两个应用
          name: "下歌吧", // 应用的完整名称（安装时显示）
          short_name: "下歌吧", // 应用的简短名称（桌面图标下方显示）
          description:
            "一个快捷便利的公开网盘搜索引擎，为您提供各类优质网盘资源的在线搜索", // 应用描述
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
              src: "/pwa/icon-maskable-48.png",
              sizes: "48x48",
              type: "image/png",
              purpose: "maskable", // 可裁剪图标，适配安卓等系统的圆角或异形图标，确保核心图案不被切掉
            },
            {
              src: "/pwa/icon-maskable-128.png",
              sizes: "128x128",
              type: "image/png",
              purpose: "maskable", // 可裁剪图标，适配安卓等系统的圆角或异形图标，确保核心图案不被切掉
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
        //
        // ⚠️ 不要整个删掉 workbox 字段：@vite-pwa/nuxt 的默认 globPatterns 是
        // "**/*.{js,css,html}"，会把全部构建产物塞进预缓存，正是要移除的行为。
        // 必须显式 globPatterns: [] 才能清零。
        //
        // SW 本身保留注册（autoUpdate）：安装兼容性兜底 + 旧版本 SW 的平滑替换，
        // 清理历史缓存仍由 cleanupOutdatedCaches 负责。
        workbox: {
          cleanupOutdatedCaches: true, // 清理之前版本留下的旧缓存，释放存储空间
          clientsClaim: true, // 新的 Service Worker 激活后，立刻接管所有打开的页面
          skipWaiting: true, // 跳过等待，强制最新的 Service Worker 立即进入激活状态
          navigateFallback: null, // 禁用导航回退：不提供离线页面

          globPatterns: [], // 零预缓存：不把任何构建产物或静态资源打包进 SW
        },

        // 开发环境配置
        devOptions: {
          enabled: false, // 在开发模式（npm run dev）下禁用 PWA 功能，避免调试困难
        },
      },
    ],
    "@nuxt/scripts",
  ],
  ui: {
    fonts: false,
  },
  experimental: {
    defaults: {
      nuxtLink: {
        prefetch: false,
      },
    },
  },
  css: ["~/assets/css/main.css"],
  icon: {
    clientBundle: {
      scan: true,
    },
  },
  app: {
    baseURL: "/",
    head: {
      htmlAttrs: { lang: "zh-CN" },
      title: "下歌吧 - 免费网盘资源搜索引擎",
      meta: [
        { charset: "utf-8" },
        {
          name: "viewport",
          content:
            "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no",
        },
        {
          name: "keywords",
          content:
            "下歌吧,网盘搜索,搜索引擎,公开网盘,资源搜索,百度网盘,夸克网盘,迅雷云盘,UC网盘,免费资源",
        },
        {
          name: "description",
          content:
            "下歌吧是一个快捷便利的公开网盘搜索引擎，为您提供各类优质网盘资源的在线搜索、精准筛选服务。",
        },
        { property: "og:site_name", content: "下歌吧" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: "下歌吧 - 免费网盘资源搜索引擎" },
        {
          property: "og:description",
          content:
            "下歌吧是一个快捷便利的公开网盘搜索引擎，为您提供各类优质网盘资源的在线搜索、精准筛选服务。",
        },
        { name: "twitter:title", content: "下歌吧 - 免费网盘资源搜索引擎" },
        {
          name: "twitter:description",
          content: "快捷便利的公开网盘搜索引擎，轻松找资源。",
        },
        { property: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "index,follow" },
        { name: "theme-color", content: "#0f172a" },
        { name: "author", content: "下歌吧" },
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
    // pageTransition: { name: "page", mode: "out-in" },
  },
  // Nuxt UI 自带的 @nuxtjs/color-mode：统一由 color-mode 管理 <html> 的 .dark/.light 类
  colorMode: {
    preference: "dark",
    fallback: "dark",
  },
  features: {
    inlineStyles: true,
  },
  routeRules: {
    "/admin/**": { ssr: false, appLayout: "admin" },
    "/admin/login": {
      ssr: true,
      appLayout: false,
    },
    "/": {
      ssr: true,
      isr: 300,
    },
    "/music/**": {
      ssr: true,
      // isr: 60 * 60 * 24 * 30,
    },
    "/source/**": {
      ssr: true,
      // isr: 60 * 60 * 24 * 30,
    },
    "/search": {
      ssr: true,
      // isr: 60 * 60 * 1,
    },
    "/img/**": {
      static: true,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
    "/pwa/**": {
      static: true,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
    "/sw.js": {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
    "/manifest.webmanifest": {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=600",
      },
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
      "*/10 * * * *": ["source:clean_temp"],
      "*/5 * * * *": ["source:check_account", "source:check_violated"],
      "0 * * * *": ["shield:cleanIpData", "shield:cleanBans"],
    },
  },
  postcss: {
    plugins: {
      "postcss-preset-env": {
        stage: 3,
      },
      autoprefixer: {},
    },
  },
  vite: {
    build: {
      cssCodeSplit: true, // 开启 CSS 代码拆分
      chunkSizeWarningLimit: 1000, // 调整 chunk 大小警告阈值
      // 在 plugin-legacy 8.1+ 中支持 Chrome 80 以下浏览器所必需
      minify: "terser",
    },
    optimizeDeps: {
      include: [
        "@lucide/vue",
        "@vueuse/core",
        "pinia",
        "qrcode",
        "axios",
        "@nuxt/ui > prosemirror-state",
        "@nuxt/ui > prosemirror-transform",
        "@nuxt/ui > prosemirror-model",
        "@nuxt/ui > prosemirror-view",
        "@nuxt/ui > prosemirror-gapcursor",
      ],
    },
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        paths: {
          "~/*": ["./*"],
        },
      },
    },
  },
  $production: {
    devtools: {
      enabled: false,
    },
    sourcemap: {
      server: false,
      client: false,
    },
    legacy: {
      vite: {
        targets: [
          "Chrome >= 87",
          "ChromeAndroid >= 87",
          "Edge >= 87",
          "Firefox >= 78",
          "Safari >= 12",
          "iOS >= 12",
        ],
        modernPolyfills: true,
        renderLegacyChunks: true,
      },
    },
  },
  $development: {
    devtools: {
      enabled: true,
    },
    sourcemap: {
      server: true,
      client: true,
    },
    alias: {
      "@netdisk-sdk/baidu-sdk": path.resolve(
        __dirname,
        "./packages/netdisk-sdk-js/packages/baidu-sdk/src",
      ),
      "@netdisk-sdk/c139-sdk": path.resolve(
        __dirname,
        "./packages/netdisk-sdk-js/packages/c139-sdk/src",
      ),
      "@netdisk-sdk/guangya-sdk": path.resolve(
        __dirname,
        "./packages/netdisk-sdk-js/packages/guangya-sdk/src",
      ),
      "@netdisk-sdk/quarkuc-sdk": path.resolve(
        __dirname,
        "./packages/netdisk-sdk-js/packages/quarkUC-sdk/src",
      ),
      "@netdisk-sdk/xunlei-sdk": path.resolve(
        __dirname,
        "./packages/netdisk-sdk-js/packages/xunlei-sdk/src",
      ),
      "@netdisk-sdk/utils": path.resolve(
        __dirname,
        "./packages/netdisk-sdk-js/packages/utils/src",
      ),
    },
  },
});
