<script setup lang="ts">
import { ShieldAlert } from "@lucide/vue";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true, async: false });

defineOptions({ name: "PolicyPage" });

useHead({
  title: "免责声明 - 全盘搜",
  meta: [
    {
      name: "description",
      content: "全盘搜免责声明，本站仅提供搜索索引服务，不存储任何音频文件。",
    },
    { name: "robots", content: "index, follow" },
  ],
});

const content = `## 免责声明

**最后更新日期：2026年1月1日**

全盘搜（以下简称"本站"）是一个音乐搜索与网盘资源索引工具。在使用本站服务之前，请您仔细阅读以下免责声明：

### 1. 服务性质

本站仅提供音乐信息的搜索、索引及链接跳转服务，**不存储、不上传、不修改任何音频文件**。所有音乐资源均来源于第三方网盘（如夸克网盘、百度网盘、迅雷云盘、UC 网盘等）的公开分享链接。

### 2. 版权归属

本站搜索结果中涉及的音频文件、封面图片、歌词等内容的版权归原作者及相关权利人所有。本站不对上述内容主张任何权利。

### 3. 使用限制

- 本站服务仅供**个人学习、研究、试听**使用，不得用于商业用途
- 用户下载的资源应在 **24 小时内删除**，如需长期使用请购买正版
- 用户不得将本站搜索到的资源用于再分发、售卖或其他侵权行为
- 因用户不当使用本站服务而产生的法律责任，由用户自行承担

### 4. 链接有效性

本站提供的网盘链接来源于公开网络，链接可能因网盘平台政策变更、分享者删除等原因失效。本站不对链接的长期有效性做出保证。

### 5. 第三方责任

用户通过本站链接访问第三方网盘平台时，应遵守该平台的服务条款和隐私政策。本站对第三方平台的内容、服务质量及安全性不承担任何责任。

### 6. 免责条款

在法律允许的最大范围内，本站不对以下情况承担责任：

- 因使用或无法使用本站服务而造成的任何直接或间接损失
- 本站搜索结果的准确性、完整性或时效性
- 用户因下载、使用第三方资源而导致的设备损坏、数据丢失等问题

### 7. 联系方式

如您认为本站内容侵犯了您的合法权益，请通过以下方式联系我们，我们将在收到通知后及时处理：

- 邮箱：liumingye2015@gmail.com

我们将在收到有效侵权通知后，及时删除相关链接，并采用技术手段屏蔽相关内容。

### 8. 声明修改

本站保留随时修改本免责声明的权利。修改后的声明自发布之日起生效，请您定期查阅。`;

const rendered = marked.parse(content) as string;
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar />

    <div class="max-w-4xl mx-auto px-2">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert class="w-6 h-6 text-primary-400" />
          免责声明
        </h1>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-1 text-sm text-color-300 hover:text-primary-400 transition-colors"
        >
          返回首页
        </NuxtLink>
      </div>

      <article class="card p-6">
        <div
          class="text-sm text-color-300 break-words leading-relaxed prose-resource"
        >
          <span v-html="rendered" />
        </div>
      </article>

      <SiteFooter />
    </div>
  </div>
</template>
