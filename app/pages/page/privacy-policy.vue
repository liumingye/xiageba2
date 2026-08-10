<script setup lang="ts">
import { Lock } from "@lucide/vue";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true, async: false });

defineOptions({ name: "PrivacyPolicyPage" });

useHead({
  title: "隐私政策 - 下歌吧",
  meta: [
    {
      name: "description",
      content: "下歌吧隐私政策，说明本站如何收集、使用和保护用户的个人信息。",
    },
    { name: "robots", content: "index, follow" },
  ],
});

const content = `## 隐私政策

**最后更新日期：2026年1月1日**

下歌吧（以下简称"本站"）重视用户隐私保护。本隐私政策说明本站如何收集、使用、存储和保护您的个人信息。请您在使用本站服务前，仔细阅读本政策。

### 1. 信息收集

本站在您使用服务过程中可能收集以下信息：

**自动收集的信息：**

- IP 地址（用于速率限制和安全防护）
- 浏览器类型、操作系统、访问时间
- 访问页面、来源页面等访问日志
- 搜索关键词（用于服务优化，不与个人身份关联）

**主动提供的信息：**

- 反馈提交中的描述内容
- AI 搜索请求内容

### 2. 信息使用

本站收集的信息仅用于以下目的：

- 提供音乐搜索与资源索引服务
- 实施速率限制，防止滥用和恶意攻击
- 优化搜索结果质量和服务性能
- 处理用户反馈
- 维护管理员账户安全

### 3. 信息存储与保护

- **传输安全**：本站支持 HTTPS 加密传输
- **日志保留**：访问日志仅保留必要期限，超期自动清理

### 4. Cookie 使用

本站使用 localStorage 存储以下信息：

- 搜索历史记录（用户可手动清除）
- 主题偏好设置

本站**不使用第三方追踪 Cookie**。

### 5. 第三方服务

本站可能涉及以下第三方服务：

- **网盘平台**（夸克、百度、迅雷、UC）：用户点击链接后跳转至第三方平台，受该平台隐私政策约束
- **AI 搜索服务**：AI 搜索请求会发送至第三方大模型 API，仅传输搜索关键词，不包含个人身份信息

本站不对第三方服务的隐私实践负责。

### 6. 信息共享

本站**不会出售、出租或交易**您的个人信息。除以下情况外，本站不会与第三方共享用户信息：

- 获得您的明确同意
- 法律法规要求或司法、行政机关强制要求
- 为保护本站、用户或公众的合法权益

### 7. 用户权利

您拥有以下权利：

- **知情权**：了解本站收集和使用您信息的方式
- **删除权**：您可以清除浏览器中的搜索历史
- **拒绝权**：您可以选择不使用需要提供信息的功能

### 8. 未成年人保护

本站不针对未满 18 周岁的未成年人提供服务。如发现未成年人在未经监护人同意的情况下使用本站服务，我们将采取措施删除相关信息。

### 9. 政策修改

本站保留随时修改本隐私政策的权利。修改后的政策自发布之日起生效。我们将通过更新页面底部的日期来提示政策的变更。

### 10. 联系方式

如您对本隐私政策有任何疑问或建议，请联系：

- 邮箱：liumingye2015@gmail.com`;

const rendered = marked.parse(content) as string;
</script>

<template>
  <div class="min-h-screen py-8 px-4">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">
          <Lock class="w-6 h-6 text-primary-400" />
          隐私政策
        </h1>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-primary-400 transition-colors"
        >
          返回首页
        </NuxtLink>
      </div>

      <article class="card p-6">
        <div
          class="text-sm text-zinc-300 break-words leading-relaxed prose-resource"
        >
          <span v-html="rendered" />
        </div>
      </article>
    </div>
  </div>
</template>
