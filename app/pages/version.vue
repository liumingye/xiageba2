<script setup lang="ts">
import { Copyright } from "@lucide/vue";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true, async: false });

defineOptions({ name: "VersionPage" });

useHead({
  title: "版权说明 - 下歌吧",
  meta: [
    {
      name: "description",
      content: "下歌吧版权说明，本站不存储音频文件，所有内容版权归原作者所有。",
    },
    { name: "robots", content: "index, follow" },
  ],
});

const content = `## 版权说明

**最后更新日期：2026年1月1日**

下歌吧（以下简称"本站"）尊重知识产权，本版权说明旨在阐明本站与版权相关内容的处理方式。

### 1. 本站立场

本网站是一个网盘搜索引擎网站，全站链接通过蜘蛛程序收集自各类网盘公开链接，**不存储、不上传、不分发任何音频文件**。本站所有搜索结果均为第三方网盘平台的公开分享链接，本站仅提供链接的索引和导航服务。

### 2. 内容来源

本站搜索结果来源于以下第三方平台：

- **夸克网盘**（pan.quark.cn）
- **百度网盘**（pan.baidu.com）
- **UC 网盘**（drive.uc.cn）
- **迅雷云盘**（pan.xunlei.com）

上述平台上的资源由各平台用户自行上传和分享，本站无法控制资源的来源和内容。

### 3. 版权归属

- 音乐作品的录音制作者权、表演者权、词曲著作权等归相关权利人所有
- 封面图片的版权归原唱片公司或设计师所有
- 歌词的版权归词作者或版权代理机构所有
- 本站页面设计、代码、功能架构的版权归本站所有

### 4. 合理使用

根据《中华人民共和国著作权法》第二十四条，在以下情形下使用作品，可以不经著作权人许可，不向其支付报酬，但应当指明作者姓名或者名称、作品名称，并且不得影响该作品的正常使用，也不得不合理地损害著作权人的合法权益：

- 为个人学习、研究或者欣赏，使用他人已经发表的作品
- 为介绍、评论某一作品或者说明某一问题，在作品中适当引用他人已经发表的作品

本站建议用户在合理使用范围内使用搜索到的资源。

### 5. 侵权处理

本站高度重视版权保护。如权利人认为本站索引的链接侵犯了其合法权益，请按照以下要求发送侵权通知：

**通知应包含：**

1. 权利人的姓名（名称）、联系方式和地址
2. 要求删除的链接 URL 及对应的侵权作品名称
3. 构成侵权的初步证明材料（如版权登记证书、授权书等）
4. 权利人真实性声明：通知内容真实准确，愿意承担因通知不实导致的法律责任

**联系方式：**

- 邮箱：liumingye2015@gmail.com

本站在收到符合要求的通知后，将在 **48 小时内**删除相关链接。

### 6. 反通知

如用户认为被删除的链接不构成侵权，可向本站提交反通知。反通知应包含：

1. 被删除链接的信息
2. 不构成侵权的理由及证明材料
3. 反通知人的真实性声明

本站收到合格的反通知后，将根据实际情况决定是否恢复相关链接。

### 7. 技术措施

本站采取以下技术措施配合版权保护：

- 仅索引公开分享的网盘链接，不主动爬取加密或私有资源
- 收到侵权通知后及时删除链接
- 对反复侵权的分享者，在技术可行的情况下限制其资源被索引

### 8. 免责

本站作为信息搜索索引服务提供者，依据《中华人民共和国民法典》及《信息网络传播权保护条例》的"避风港"原则，在收到合格侵权通知后及时删除侵权链接的，不承担赔偿责任。`;

const rendered = marked.parse(content) as string;
</script>

<template>
  <div class="min-h-screen bg-dark-300 py-8 px-4">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">
          <Copyright class="w-6 h-6 text-primary-400" />
          版权说明
        </h1>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-primary-400 transition-colors"
        >
          返回首页
        </NuxtLink>
      </div>

      <article class="card p-6">
        <div
          class="text-sm text-gray-300 break-words leading-relaxed prose-resource"
        >
          <span v-html="rendered" />
        </div>
      </article>
    </div>
  </div>
</template>
