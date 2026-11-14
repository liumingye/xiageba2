<script setup lang="ts">
import { computed } from "vue";
import {
  DEFAULT_APP_PREVIEW_IMAGE,
  emptyAppConfig,
  type AppDownloadConfig,
} from "~/utils/app";

defineOptions({ name: "AppDownloadPage" });

// 落地页内容更宽（布局层 max-w-6xl），其余页面保持 4xl
definePageMeta({ landing: true });

const { siteShortTitle } = await useSiteSeo();

interface AppConfigResponse {
  data: AppDownloadConfig;
}

const { data } = await useFetch<AppConfigResponse>("/api/app/config", {
  default: () => ({ data: emptyAppConfig() }),
  key: "app-config",
  dedupe: "defer",
});

const appConfig = computed<AppDownloadConfig>(
  () => data.value?.data || emptyAppConfig(),
);

/** 是否配置了 APK 下载地址 */
const hasApk = computed(() => !!appConfig.value.apkUrl);

/** 分享图 / 兜底预览图（后台可配置） */
const previewImage = computed(
  () => appConfig.value.previewImageUrl || DEFAULT_APP_PREVIEW_IMAGE,
);

/**
 * 首屏手机截图
 */
const heroImage = computed(
  () => appConfig.value.previewImageUrl || "/img/app/hero-phone.webp",
);

const heroHighlights = ["百万资源", "免费无广", "每日更新"];

/**
 * 五角星路径（lucide star）
 *
 * 项目里的图标是 Nuxt Icon 的 CSS mask 模式（<span class="iconify">），
 * 没有 path 可以改 fill，"实心星级"只能用内联 SVG 画。
 */
const STAR_PATH =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z";

const stats = [
  { value: "1,000", unit: "+", label: "活跃用户" },
  { value: "4.9", unit: "星", label: "应用评分" },
  { value: "100万", unit: "+", label: "收录资源" },
  { value: "95", unit: "%", label: "链接可用率" },
];

const features = [
  {
    icon: "i-lucide-search",
    title: "网盘搜索",
    desc: "百度、夸克、光鸭、迅雷 等 7+ 网盘一站检索，按分类筛选。",
  },
  {
    icon: "i-lucide-refresh-cw",
    title: "更新频繁",
    desc: "资源库每日增量更新，热门影视、新歌上线当天就能搜到。",
  },
  {
    icon: "i-lucide-music",
    title: "音乐下载",
    desc: "超多的热门歌曲下载，歌词、音质一目了然。",
  },
  {
    icon: "i-lucide-book-open",
    title: "百度小说",
    desc: "丰富的小说资源库，支持在线阅读与获取口令。",
  },
];

const steps = [
  {
    title: "输入关键词",
    desc: "在搜索框输入歌名、剧名或资源名，支持拼音与模糊匹配。",
  },
  {
    title: "挑选资源",
    desc: "按网盘类型、资源类型、更新时间筛选，目录结构一眼看清。",
  },
  {
    title: "获得网盘链接",
    desc: "一键复制链接或打开链接，跳到对应网盘 App 即可下载。",
  },
];

const testimonials = [
  {
    avatar: "/img/app/avatar-1.svg",
    name: "一叶知秋",
    role: "影视剪辑师",
    rating: 5,
    quote:
      "找了半年的老纪录片，在这儿两分钟就搜到了，链接还是活的。以前在别的地方点开全是失效页面，浪费一晚上。",
  },
  {
    avatar: "/img/app/avatar-2.svg",
    name: "小满",
    role: "在读研究生",
    rating: 5,
    quote:
      "写论文要的资料合集，能直接看到目录结构，不用一个个点进去试。免费还没广告，太舒服了。",
  },
  {
    avatar: "/img/app/avatar-3.svg",
    name: "阿左",
    role: "独立音乐人",
    rating: 5,
    quote: "冷门专辑基本都能搜到，音质比我预期好很多，现在上下班路上一直在用。",
  },
  {
    avatar: "/img/app/avatar-4.svg",
    name: "南风",
    role: "前端开发",
    rating: 5,
    quote:
      "界面干净，没有乱七八糟的跳转和弹窗，搜完直接给网盘链接。做产品的都该学学这种克制。",
  },
  {
    avatar: "/img/app/avatar-5.svg",
    name: "北岛",
    role: "自由职业者",
    rating: 4,
    quote:
      "找资源不用再到处翻论坛了，搜索速度快，分类和筛选也很方便。还能直接查看资源信息，日常找软件和学习资料基本都能满足。",
  },
  {
    avatar: "/img/app/avatar-6.svg",
    name: "老猫",
    role: "全职奶爸",
    rating: 5,
    quote:
      "给孩子找动画片，搜到的都是完整版，不是那种东拼西凑的片段合集，省了不少事。",
  },
];

const faqs = [
  {
    label: "这个 App 收费吗？",
    content:
      "完全免费。没有会员、没有广告，也不限制搜索次数 —— 服务器成本靠站长自己扛，觉得好用推荐给朋友就行。",
  },
  {
    label: "搜到资源后怎么下载？",
    content:
      "点击“获取链接”按钮可以获取对应网盘的分享链接，在浏览器中打开链接或复制链接后打开对应网盘保存后即可下载。",
  },
  {
    label: "支持哪些网盘？",
    content:
      "目前已覆盖百度网盘、夸克网盘、UC 网盘、迅雷云盘、移动云盘、光鸭网盘等，后续还在持续增加。",
  },
  {
    label: "iOS 可以用吗？",
    content:
      "目前只提供安卓 APK 安装包。iPhone 用户可以直接使用网页版，搜索、筛选、取链接的功能完全一致，无需安装。",
  },
  {
    label: "为什么有些资源搜索不到？",
    content:
      "搜索结果取决于各网盘中已有的公开分享资源。如果暂时没有找到，可以尝试更换关键词、使用资源名称的简称，或减少关键词重新搜索。我们也会持续优化搜索能力，扩充资源覆盖范围。",
  },
];

useSeoMeta({
  title: "APP 下载 · 公开网盘搜索引擎",
  description: `下载 ${siteShortTitle} 安卓客户端：百万网盘资源一站搜索，音乐、小说、影视、软件全部免费，无广告，链接可用性实时检测。`,
  ogTitle: "APP 下载 · 公开网盘搜索引擎",
  ogDescription: `百万网盘资源一站搜索，免费无广告，立即下载 ${siteShortTitle} 安卓客户端。`,
  ogImage: previewImage,
  twitterTitle: "APP 下载 · 公开网盘搜索引擎",
  twitterDescription: `百万网盘资源一站搜索，免费无广告，立即下载 ${siteShortTitle} 安卓客户端。`,
  twitterImage: previewImage,
});

// FAQ 结构化数据：让搜索结果能直接展开问答
useHead({
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((item) => ({
          "@type": "Question",
          name: item.label,
          acceptedAnswer: { "@type": "Answer", text: item.content },
        })),
      }),
    },
  ],
});
</script>

<template>
  <div class="app-landing">
    <!-- ================= 1. Hero ================= -->
    <section class="relative isolate">
      <!-- 背景：点阵 + 光晕 -->
      <div class="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-155">
        <div class="hero-grid absolute inset-0" />
        <div
          class="absolute -top-24 left-1/2 size-130 -translate-x-1/2 rounded-full bg-primary/18 blur-[110px] dark:bg-primary/15"
        />
        <div
          class="absolute -top-10 right-0 size-75 rounded-full bg-emerald-400/15 blur-[90px] dark:bg-emerald-400/10"
        />
      </div>

      <div
        class="grid items-center gap-12 pt-4 pb-10 sm:gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:pt-10"
      >
        <div class="flex flex-col items-start">
          <UBadge
            color="primary"
            variant="soft"
            size="lg"
            class="rounded-full pr-3.5"
          >
            <span class="relative mr-1 flex size-1.5">
              <span
                class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70"
              />
              <span
                class="relative inline-flex size-1.5 rounded-full bg-primary"
              />
            </span>
            {{
              appConfig.versionName
                ? `v${appConfig.versionName} 已发布`
                : "百万资源 · 每日更新"
            }}
          </UBadge>

          <h1
            class="mt-5 text-[2.1rem] leading-[1.12] font-black tracking-tight text-highlighted sm:text-5xl lg:text-[3.4rem]"
          >
            公开网盘<span
              class="bg-linear-to-r from-green-700 via-primary-600 to-teal-600 bg-clip-text text-transparent dark:from-primary-400 dark:via-emerald-400 dark:to-teal-400"
              >搜索引擎</span
            >
          </h1>

          <p
            class="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-[1.05rem]"
          >
            音乐、小说、影视、软件、教程 —— 一个关键词搜遍全网公开网盘。
            免注册、免费、无广告，链接可用性实时检测。
          </p>

          <div
            class="mt-7 flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          >
            <AppDownloadButton
              v-if="hasApk"
              :to="appConfig.apkUrl"
              label="免费下载 APK"
            />
          </div>

          <p v-if="!hasApk" class="mt-3 text-xs text-muted">
            APK 安装包正在准备中，可先使用网页版。
          </p>

          <ul
            class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted sm:text-sm"
          >
            <li
              v-for="item in heroHighlights"
              :key="item"
              class="flex items-center gap-1.5"
            >
              <UIcon name="i-lucide-check" class="size-4 text-primary" />
              {{ item }}
            </li>
          </ul>
        </div>

        <!-- 产品截图 -->
        <div class="relative mx-auto w-58 sm:w-63">
          <div
            class="absolute -inset-10 -z-10 rounded-full bg-primary/20 blur-3xl"
          />
          <div
            class="relative overflow-hidden rounded-4xl border border-white/10 bg-zinc-950 p-1.5 shadow-2xl shadow-primary/10 ring-1 ring-black/5"
          >
            <img
              :src="heroImage"
              alt="APP 界面预览"
              width="720"
              height="1352"
              class="block w-full rounded-[1.65rem]"
              fetchpriority="high"
            />
          </div>

          <div
            class="animate-float absolute top-[16%] -left-24 hidden items-center gap-2.5 rounded-xl border border-default bg-default/90 px-3 py-2 shadow-xl shadow-black/5 backdrop-blur sm:flex lg:-left-32"
          >
            <span
              class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-shield-check" class="size-4" />
            </span>
            <div>
              <p class="text-[11px] leading-none font-medium text-highlighted">
                链接有效性检测
              </p>
              <p class="mt-1 text-[10px] leading-none text-muted">
                失效资源自动剔除
              </p>
            </div>
          </div>

          <div
            class="animate-float absolute -right-24 bottom-[14%] hidden items-center gap-2.5 rounded-xl border border-default bg-default/90 px-3 py-2 shadow-xl shadow-black/5 backdrop-blur sm:flex lg:-right-28"
            style="animation-delay: -2.4s"
          >
            <span
              class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <UIcon name="i-lucide-zap" class="size-4" />
            </span>
            <div>
              <p class="text-[11px] leading-none font-medium text-highlighted">
                百万资源秒出
              </p>
              <p class="mt-1 text-[10px] leading-none text-muted">
                关键词即搜即得
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= 2. 信任背书 ================= -->
    <section aria-label="数据背书">
      <dl
        class="grid grid-cols-2 gap-y-7 rounded-2xl border border-default bg-elevated/60 px-4 py-7 sm:px-8 lg:grid-cols-4 lg:py-8"
      >
        <div
          v-for="(item, i) in stats"
          :key="item.label"
          class="flex flex-col items-center gap-1.5 text-center lg:border-l lg:border-default lg:first:border-l-0"
          :class="
            i < 2 ? 'border-b border-default pb-6 lg:border-b-0 lg:pb-0' : ''
          "
        >
          <dt
            class="text-2xl font-extrabold tracking-tight text-highlighted tabular-nums sm:text-3xl"
          >
            {{ item.value }}<span class="text-primary">{{ item.unit }}</span>
          </dt>
          <dd class="text-xs text-muted sm:text-sm">{{ item.label }}</dd>
        </div>
      </dl>
    </section>

    <!-- ================= 3. 功能亮点 ================= -->
    <section class="mt-20">
      <div class="mx-auto max-w-2xl text-center">
        <span
          class="inline-flex items-center rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-primary"
          >功能亮点</span
        >
        <h2
          class="mt-4 text-2xl font-bold tracking-tight text-highlighted sm:text-3xl"
        >
          一个 App，覆盖你的全部资源需求
        </h2>
        <p class="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          不是简单堆链接，而是把「能不能用」也一起管好。
        </p>
      </div>

      <div class="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UCard
          v-for="item in features"
          :key="item.title"
          class="group rounded-2xl border border-default bg-elevated p-0 transition duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-default hover:shadow-xl hover:shadow-primary/5"
        >
          <span
            class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition duration-200 group-hover:bg-primary group-hover:text-white group-hover:ring-primary mb-2"
          >
            <UIcon :name="item.icon" class="size-5" />
          </span>
          <h3 class="text-base font-semibold text-highlighted">
            {{ item.title }}
          </h3>
          <p class="text-sm leading-relaxed text-muted">{{ item.desc }}</p>
        </UCard>
      </div>
    </section>

    <!-- ================= 4. 使用流程 ================= -->
    <section class="mt-20">
      <div class="mx-auto max-w-2xl text-center">
        <span
          class="inline-flex items-center rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-primary"
          >使用流程</span
        >
        <h2
          class="mt-4 text-2xl font-bold tracking-tight text-highlighted sm:text-3xl"
        >
          三步拿到网盘链接
        </h2>
      </div>

      <ol class="relative mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
        <div
          class="pointer-events-none absolute top-5 right-[16.66%] left-[16.66%] hidden h-px bg-[repeating-linear-gradient(90deg,#d4d4d8_0_6px,transparent_6px_12px)] sm:block dark:bg-[repeating-linear-gradient(90deg,#3f3f46_0_6px,transparent_6px_12px)]"
          aria-hidden="true"
        />

        <li
          v-for="(step, i) in steps"
          :key="step.title"
          class="relative flex gap-4 sm:flex-col sm:items-center sm:gap-3 sm:text-center"
        >
          <span
            class="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-primary/30 bg-default text-sm font-bold text-primary shadow-sm ring-4 ring-default"
          >
            {{ i + 1 }}
          </span>
          <div>
            <h3 class="text-base font-semibold text-highlighted">
              {{ step.title }}
            </h3>
            <p
              class="mt-1.5 text-sm leading-relaxed text-muted sm:mx-auto sm:max-w-60"
            >
              {{ step.desc }}
            </p>
          </div>
        </li>
      </ol>
    </section>

    <!-- ================= 5. 用户评价 ================= -->
    <section class="mt-20">
      <div class="flex flex-col items-center gap-4 text-center">
        <span
          class="inline-flex items-center rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-primary"
          >用户评价</span
        >
        <h2
          class="text-2xl font-bold tracking-tight text-highlighted sm:text-3xl"
        >
          他们已经用上了
        </h2>
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <div class="flex items-center gap-0.5" aria-hidden="true">
            <svg
              v-for="n in 5"
              :key="n"
              viewBox="0 0 24 24"
              class="size-4 text-amber-400"
            >
              <path
                :d="STAR_PATH"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <p class="text-sm text-muted">
            <span class="font-semibold text-highlighted">4.9 / 5</span>
            来自 1,000+ 位用户的真实反馈
          </p>
        </div>
      </div>

      <!-- 瀑布流：CSS columns -->
      <div class="mt-9 gap-4 sm:columns-2 lg:columns-3 *:mb-4">
        <figure
          v-for="item in testimonials"
          :key="item.name"
          class="relative break-inside-avoid rounded-2xl border border-default bg-elevated p-5 transition duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
        >
          <div class="flex items-center gap-3">
            <img
              :src="item.avatar"
              :alt="item.name"
              width="40"
              height="40"
              class="size-10 shrink-0 rounded-full ring-1 ring-default"
              loading="lazy"
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-highlighted">
                {{ item.name }}
              </p>
              <p class="mt-0.5 truncate text-xs text-muted">{{ item.role }}</p>
            </div>
            <div class="ml-auto flex shrink-0 items-center gap-0.5">
              <svg
                v-for="n in 5"
                :key="n"
                viewBox="0 0 24 24"
                class="size-3.5"
                :class="
                  n <= item.rating
                    ? 'text-amber-400'
                    : 'text-zinc-300 dark:text-zinc-600'
                "
              >
                <path
                  :d="STAR_PATH"
                  :fill="n <= item.rating ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
          </div>
          <blockquote class="mt-3.5 text-sm leading-relaxed text-toned">
            “{{ item.quote }}”
          </blockquote>
        </figure>
      </div>
    </section>

    <!-- ================= 6. FAQ ================= -->
    <section class="mt-20">
      <div class="mx-auto max-w-2xl text-center">
        <span
          class="inline-flex items-center rounded-full border border-default bg-elevated px-3 py-1 text-xs font-medium text-primary"
          >常见问题</span
        >
        <h2
          class="mt-4 text-2xl font-bold tracking-tight text-highlighted sm:text-3xl"
        >
          下载前你可能想知道
        </h2>
      </div>

      <div class="mx-auto mt-8 max-w-3xl">
        <UAccordion
          :items="faqs"
          type="single"
          collapsible
          :ui="{
            root: 'rounded-2xl border border-default bg-elevated/50 px-4 sm:px-5',
            item: 'border-b border-muted last:border-b-0',
            trigger: 'py-4 text-left cursor-pointer',
            label: 'text-sm font-medium text-highlighted sm:text-[0.95rem]',
            trailingIcon: 'size-4 text-muted',
            content: 'pb-4 -mt-1',
            body: 'text-sm leading-relaxed text-muted',
          }"
        />
      </div>
    </section>

    <!-- ================= 7. 底部 CTA ================= -->
    <section class="mt-20">
      <div
        class="relative overflow-hidden rounded-3xl border border-primary/20 bg-linear-to-br from-primary-500/12 via-primary-500/5 to-emerald-400/10 px-6 py-12 text-center sm:px-12 sm:py-14"
      >
        <div
          class="pointer-events-none absolute -top-24 left-1/2 size-105 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]"
          aria-hidden="true"
        />
        <div class="relative">
          <h2
            class="text-2xl font-black tracking-tight text-highlighted sm:text-[2rem]"
          >
            把百万资源装进口袋
          </h2>
          <p
            class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base"
          >
            安卓 APK 直装，两分钟上手。无需注册，打开即搜。
          </p>

          <div
            class="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <AppDownloadButton
              v-if="hasApk"
              :to="appConfig.apkUrl"
              label="立即下载 APP"
            />
          </div>

          <p class="mt-4 text-xs text-muted">
            <template v-if="appConfig.versionName">
              当前版本 v{{ appConfig.versionName }} ·
            </template>
            仅支持安卓 8.0 及以上 · 免费无广告
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 首屏点阵背景 */
.hero-grid {
  background-image: radial-gradient(
    circle at 1px 1px,
    rgb(34 197 94 / 0.22) 1px,
    transparent 0
  );
  background-size: 22px 22px;
  mask-image: radial-gradient(
    ellipse 65% 55% at 50% 25%,
    #000 20%,
    transparent 72%
  );
}

/* 手机旁浮动小卡片 */
.animate-float {
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate-float {
    animation: none;
  }
}
</style>
