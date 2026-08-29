<script setup lang="ts">
import { FileSignature } from "@lucide/vue";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true, async: false });

defineOptions({ name: "AgreementPage" });

useHead({
  title: "服务协议 - 全盘搜",
  meta: [
    {
      name: "description",
      content:
        "全盘搜服务协议，规范用户使用本站音乐搜索与索引服务的权利与义务。",
    },
    { name: "robots", content: "index, follow" },
  ],
});

const content = `## 服务协议

**最后更新日期：2026年1月1日**

欢迎您使用全盘搜（以下简称"本站"）。请您在使用本站服务前，仔细阅读并充分理解以下服务协议条款。您访问或使用本站服务，即表示您已同意接受本协议的全部条款。

### 1. 服务内容

本站为用户提供以下服务：

- 第三方网盘资源链接的聚合与展示
- 资源有效性检测
- 目录树查看

本站保留随时新增、修改或终止部分服务的权利。

### 2. 用户注册

- 本站常规搜索功能**无需注册**即可使用
- 部分高级功能（如反馈提交、AI 搜索等）可能需要验证用户身份
- 用户应提供真实、准确的信息，并对账户活动负责

### 3. 用户行为规范

用户在使用本站服务时，应遵守以下规范：

- 不得利用本站服务从事任何违法违规活动
- 不得对本站进行恶意攻击、爬取、流量注入等破坏性行为
- 不得试图绕过本站的安全机制或访问限制
- 不得冒用他人身份或伪造信息
- 不得将本站服务用于批量下载、再分发等商业行为

### 4. 知识产权

- 本站的页面设计、代码、图标等版权归本站所有
- 搜索结果中涉及的音频、图片、歌词等内容的版权归原作者所有
- 用户不得复制、仿冒本站的界面设计或功能

### 5. 速率限制

为保证服务稳定，本站实施了请求速率限制：

- 全局限制：**30 次请求 / 60 秒**
- 触发限制后，将被暂时冷却 **3600 秒**

请合理使用本站服务，避免频繁刷新或自动化请求。

### 6. 服务变更与中断

- 本站可能因系统维护、升级等原因中断服务，届时将尽量提前公告
- 本站不对服务的不中断性、稳定性做出绝对保证
- 因不可抗力（如自然灾害、网络故障等）导致服务中断，本站不承担责任

### 7. 协议修改

本站保留随时修改本服务协议的权利。修改后的协议自发布之日起生效，请您定期查阅。继续使用本站服务即视为您接受修改后的协议。

### 8. 联系方式

如有任何关于本协议的疑问，请联系：

- 邮箱：liumingye2015@gmail.com`;

const rendered = marked.parse(content) as string;
</script>

<template>
  <div class="min-h-screen pb-4 md:pb-6">
    <TopBar />

    <div class="max-w-4xl mx-auto px-2">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <FileSignature class="w-6 h-6 text-primary-400" />
          服务协议
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
