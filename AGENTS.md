# AGENTS.md

本文件为 AI 代理（Claude Code、Cursor、Trae 等）在本仓库中工作的指导文档。阅读后请遵循其中的约定与约束。

## 项目概述

下歌吧：基于 Nuxt 4 + Vue 3 + PostgreSQL + Prisma 7 的音乐下载与网盘资源搜索网站。详细技术栈与功能见 [README.md](./README.md)。

- 包管理器：**pnpm**（workspace 协议，禁止用 npm/yarn 安装依赖）
- Node.js ≥ 20，PostgreSQL ≥ 15，Redis 可选
- 网盘 SDK 以 workspace 包形式集成在 `packages/netdisk-sdk-js/`

## 常用命令

```bash
pnpm install              # 安装依赖（必须用 pnpm）
pnpm dev                  # 启动开发服务器（带 --host）
pnpm build                # 构建生产版本
pnpm test                 # 运行 vitest 测试
npx prisma migrate dev --name <name>   # 创建新迁移（禁止用 db push）
npx prisma migrate deploy              # 应用迁移
npx prisma generate                    # 重新生成 Prisma Client
node scripts/seed-admin.mjs [user] [pass]   # 创建管理员
```

修改 Prisma schema 后必须：`npx prisma migrate dev --name xxx` → 重启 dev server（旧 Client 会被 Nuxt 缓存）。

## 目录约定

```
app/                  # 业务代码（srcDir）
  components/         # 自动导入
    admin/            # 后台组件（AdminHeader/AdminNav/AdminPagination/FilePickerModal/ScrapeModal）
  composables/        # 自动导入（useAuth/useBackHistory/usePanCheck/useToast/useTheme/useFunnyLoading）
  pages/              # 文件路由
    admin/            # 后台页面（SSR 关闭）
      music/          # 音乐管理（add.vue, edit/[id].vue）
      storage/        # 存储管理（config.vue, files.vue）
      announcement.vue, apiList.vue, category.vue, feedback.vue,
      maintain.vue, resource.vue, account.vue, admins.vue, login.vue
    announcement/     # 公告（index.vue, [id].vue）
    music/[id].vue, source/[id].vue, categorie/[id].vue
    policy.vue, agree.vue, privacy-policy.vue, version.vue   # 静态法律页面
    forbidden-keywords.vue                                    # 违禁词展示
  stores/             # Pinia
  utils/              # 自动导入（含 request.ts axios 封装、highlight.ts）
server/               # Nitro 服务端
  api/                # API 路由（文件路由）
    admin/            # 后台 API（须经 admin-auth 中间件校验）
      storage/        # S3 存储管理（config/, files/）
      music/          # 音乐 CRUD + scrape + check-links + rebuild-search
      config/         # 配置管理（ai-search, ad-filter, web-search-filter, accounts, aes, pancheck, redis, hotwords）
      baidu/          # 百度 OAuth（oauth-authorize, oauth-token）
      announcement/, apiList/, category/, feedback/, source/, cache/
    music/, source/, category/, douban/, other/, announcement/
    ai-search.ts      # AI 搜索流式
    forbidden-keywords.get.ts, hotwords.get.ts, image-proxy.get.ts
  lib/                # prisma/redis/pan/s3/simpleAC/configCache/crypto/email/webSearch 等单例
  middleware/         # admin-auth.ts
  routes/             # sitemap.xml、/s/keyword 跳转
  tasks/              # 定时任务（nitro experimental tasks）
  utils/              # jieba、password、auth、queue、scraper、netDiskLinkValidator、source
shared/utils/         # 前后端共享工具
packages/netdisk-sdk-js/   # 网盘 SDK（workspace）
  packages/baidu-sdk/, quarkuc-sdk/, xunlei-sdk/
prisma/               # schema 与 migrations
```

- `#server/...`、`#shared/...` 是 Nitro 端的别名（见 tsconfig）
- `~/`、`@/` 指向 `app/`

## 硬性约束（必须遵守）

### 安全

- 所有 admin 写操作必须经 [server/middleware/admin-auth.ts](server/middleware/admin-auth.ts) 校验 Bearer Token
- 密码使用 **scrypt** 存储（N=2^14, r=8, p=1, hashLen=32, saltLen=16），见 [server/utils/password.ts](server/utils/password.ts)。禁止用 SHA-256
- `ADMIN_SECRET` 环境变量必须配置，**禁止硬编码兜底 secret**；校验在函数调用时进行，不能在模块初始化时校验（会阻塞 Nitro 启动）
- 搜索与列表 API 必须用 `pg` 原生参数化查询（`$1, $2...`），禁止字符串拼接 SQL

### 数据库

- **禁止 `prisma db push`**，必须用 `prisma migrate dev --name <name>`
- 迁移有依赖顺序（如建表必须在 FTS 之前），命名要能体现用途
- Prisma 7 使用 Driver Adapter（`@prisma/adapter-pg`），`new PrismaClient()` 无参调用会报错
- `binaryTargets` 必须包含 `debian-openssl-3.0.x`（部署环境）
- `prisma.config.ts` 在 ESM 中用 `import.meta.url`，不要用 `__dirname`
- `prisma db pull` 可能丢掉 `@default(cuid(2))` 和 `@updatedAt`，pull 后需手动核对
- 迁移文件一旦合并到主干，**禁止修改**，只能新增迁移

### 搜索

- 中文分词用 **@node-rs/jieba**（预编译二进制），**不要用 nodejieba**（C++ 原生模块在 Linux 容器会架构不匹配）
- tsquery 必须用 `plainto_tsquery('simple', $1)`（自动处理标点），**禁止手动拼接 tokens 走 `to_tsquery`**（标点会语法错）
- `searchVector` 字段由应用层写入，**不要建数据库触发器**
- 搜索分页限制：最多 100 页、每页最多 20 条、总数最多 2000 条，由 `MAX_PAGE` 常量统一管理
- 搜索关键词上限 30 字符；反馈描述上限 100 字符
- 违禁词过滤用 [server/lib/simpleAC.ts](server/lib/simpleAC.ts) 的 `SimpleAC` 类（自实现 AC 自动机，无外部依赖）
  - `hasMatch(text)` — 子串匹配（包含即命中）
  - `hasFullMatch(text)` — 完整匹配（整词等于才命中）
  - 搜索场景用 `hasFullMatch`，避免误伤正常搜索（如"激情演唱会"不应被"激情"屏蔽）
  - 违禁词列表通过 `autompton_websearch_filter_keywords` 导出，`websearch_filter_keywords_list` 保留原始数组供展示

### 前端

- 首页、搜索、详情页必须 **SSR + `useAsyncData({ server: true })`**
- 客户端专属组件（失效链接遮罩、检测状态图标等）必须用 `<ClientOnly>` 包裹，避免 hydration mismatch
- Pinia 中只存客户端的状态（如 searchHistory）需用 `skipHydrate`
- 音频元素必须在用户点击播放按钮时**动态创建**，禁止静态 `<audio>` 标签
- 下载弹窗行为按设备区分：PC 显示二维码（切换音质自动换码），移动端直接跳转链接
- 返回按钮逻辑统一走 [app/composables/useBackHistory.ts](app/composables/useBackHistory.ts)

### 后台请求统一用 axios

- **禁止在 admin 页面/组件中使用原生 `fetch`**，统一用 [app/utils/request.ts](app/utils/request.ts) 封装
- 导出的快捷方法：`get` / `post` / `put` / `del` / `patch`（`del` 是 delete 的别名，因 delete 是 JS 保留字）
- 请求拦截器自动从 `localStorage` 读取 `admin-token` 注入 `Authorization: Bearer <token>`
- 响应拦截器统一处理 401：清除登录态并跳转 `/admin/login?redirect=xxx`
- **不再需要**手动调用 `getAuthHeaders()` 或在业务代码中检查 `res.status === 401`
- FormData 上传时**不要**设置 `Content-Type`，axios 自动处理 multipart boundary
- 需要 AbortController 时传 `signal` 参数：`get(url, { signal: controller.signal })`
- 错误信息从 `e?.response?.data?.message` 提取（axios 错误结构）

### 网盘

- `/api/source/geturl.ts` 中的 URL 必须校验 hostname 是否在白名单：`pan.quark.cn`、`pan.baidu.com`、`drive.uc.cn`、`pan.xunlei.com`；非白名单跳过处理直接返回原 URL
- 链接有效性检测统一走 [app/composables/usePanCheck.ts](app/composables/usePanCheck.ts)，支持 `ids`（本地资源）和 `urls`（全网搜结果）两种模式
- 目录树输出（`tree.get.ts`）对 depth=0 的顶层目录**省略** `└─`/`├─` 连接符，从二级目录才开始用连接符
- 百度网盘 SDK 用 `fsOpenApi`，不要用旧的 `fsApi`

### S3 存储

- S3 配置存 `S3Config` 表（id 自增 int），软删除用 `isHidden` 字段
- 文件记录存 `StorageFile` 表（id 自增 int），软删除用 `isDeleted` 字段
- S3 客户端封装在 [server/lib/s3.ts](server/lib/s3.ts)，含客户端缓存（`clientCache: Map`）
- 配置更新/删除后调用 `clearS3ClientCache(configId)` 清缓存
- `getFullKey(config, key)` 拼接 prefix，`getFileUrl(config, key)` 拼接访问 URL
- 文件上传前检测重复：同 configId + path 的未删除记录则跳过，返回已有记录
- 重命名用 `CopyObjectCommand` + `DeleteObjectCommand`，`CopySource` 路径部分必须 `encodeURIComponent`（中文文件名会报 `Invalid character in header content`）
- 前端文件选择器：[app/components/admin/FilePickerModal.vue](app/components/admin/FilePickerModal.vue)，支持上传/选择/删除/搜索
- 文件管理页面用 grid 布局（非列表），图片可预览，其他显示文件类型图标

### 配置与缓存

- 配置数据统一用 `config(key, value?)` 函数访问（[server/lib/configCache.ts](server/lib/configCache.ts)）
- 配置缓存用 Map 存整个 Config 表，TTL 1 天；更新时清整个缓存
- `/api/source/tree` 对 URL 输入模式（inputUrl）缓存到 Redis（1 天 TTL），ID 输入模式不缓存
- 限流用 `nuxt-api-shield`，全局 30 req/60s；路由级规则见 [nuxt.config.ts](nuxt.config.ts)
- 限流 IP 识别顺序：`X-Forwarded-For` → `X-Real-IP` → `socket.remoteAddress`

### Markdown 渲染

统一用 `marked` 包，全局配置 `marked.setOptions({ gfm: true, breaks: true, async: false })`，**不要自实现 markdown 解析器**。当前使用位置：

- [app/components/AiChat.vue](app/components/AiChat.vue) — AI 对话气泡
- [app/pages/source/[id].vue](app/pages/source/[id].vue) — 资源描述
- [app/pages/announcement/index.vue](app/pages/announcement/index.vue) — 公告列表预览
- [app/pages/announcement/[id].vue](app/pages/announcement/[id].vue) — 公告详情
- 静态法律页面（policy/agree/privacy-policy/version）也用 marked 渲染

### AI 搜索

- 配置存 `Config` 表 key=`ai_search`，字段：`enabled` / `baseURL` / `apiKey` / `model`
- API：[server/api/admin/config/ai-search.ts](server/api/admin/config/ai-search.ts)（读写）、[server/api/ai-search.ts](server/api/ai-search.ts)（流式调用）
- 模型名从配置读取，**禁止在代码中硬编码** `model: "qwen-plus"` 之类
- 流式响应用 `text/event-stream`，格式 `data: {"chunk":"..."}\n\n`，结束发 `data: [DONE]\n\n`
- 排队机在 [server/utils/queue.ts](server/utils/queue.ts)，请求并发过高时给前端推送排队进度
- 前端在 [app/pages/search.vue](app/pages/search.vue)，用 AbortController 终止请求；`abort()` 是异步的，watch 搜索词变更时需同步重置 `aiLoading = false` 再发起新请求

## 代码规范

### Vue 组件

- 用 `<script setup lang="ts">` 组合式 API
- 图标统一用 `@lucide/vue`
- 表格类页面统一布局：`table-auto` + 指定列宽；长文本用 `truncate` + `title` 属性做 hover tooltip
- 后台页面用 `AdminHeader` + `AdminNav` + `AdminPagination` 三个公共组件保持一致
- 后台分页与筛选状态同步到 URL query（`?page=N&q=...` / `?page=N&status=PENDING`），并 `watch(route.query)` 处理浏览器前进/后退
- `SearchBarBig.vue` 中搜索类型切换按钮在 SSR/hydration 阶段用灰色占位骨架，挂载后再渲染真实按钮，避免 hydration mismatch
- 图片加载错误处理用响应式 `ref` 跟踪状态（如 `coverImgError`），src 变化时重置；**禁止**直接操作 `style.display='none'`（src 变更后不会恢复）

### 服务端 API

- `defineEventHandler` + `createError` 抛错
- 流式响应用 Node `Readable`（`new Readable({ read() {} })`）配合 `setHeaders` 设 `text/event-stream`
- 路由文件命名遵循 Nuxt 约定：`index.get.ts`、`[id].ts`、`xxx.post.ts`
- 路由参数会被 Nuxt 自动 URL 解码，但前端用 `encodeURIComponent` 编码的 `/`（`%2F`）可能不会被还原，需在服务端 `decodeURIComponent`

### 网盘 SDK 修改

- 开发环境通过 [nuxt.config.ts](nuxt.config.ts) 的 `alias` 把 workspace 包指向 `src/`，修改 SDK 源码即时生效
- 生产环境用 workspace 协议安装编译后的产物

## 常见陷阱

1. **`prisma db pull` 丢字段**：pull 后检查 `@default(cuid(2))`、`@updatedAt` 是否还在
2. **`$queryRawUnsafe` 参数冲突**：嵌套子查询的多个占位符会冲突，复杂 SQL 改用 `pg` Pool 原生查询
3. **nodejieba 部署失败**：Linux 容器架构不匹配，必须用 `@node-rs/jieba`
4. **Nuxt 缓存旧 Prisma Client**：改 schema 后必须重启 dev server
5. **scripts/seed-admin.mjs 直跑不读 .env**：直接 `node` 执行不会自动加载 .env，需 `import "dotenv/config"` 或手动加载
6. **Dockerfile 中 NODE_ENV 时机**：`NODE_ENV=production` 必须在 `npm run build` **之后**设置；提前设置会跳过 devDependencies 安装，导致 `@nuxtjs/tailwindcss` 等构建依赖缺失
7. **正则解析 HTML 不可靠**：嵌套元素和 class 变体会让正则失效，用 `cheerio`
8. **aiLoading 与空回复框同时出现**：流式渲染时把加载动画合并到空的 assistant 气泡内部，不要单独渲染加载块
9. **更换搜索词后新请求被跳过**：`abort()` 是异步的，finally 还没执行 `aiLoading` 仍为 true，会在 `if (!content || aiLoading.value) return` 处退出；watch 中要同步重置 `aiLoading = false` 再发起新请求
10. **图片加载错误后无法恢复**：`@error="($event.target as any).style.display='none'"` 会在 src 变更后仍保持隐藏；改用响应式 ref 跟踪错误状态
11. **S3 中文文件名重命名报错**：`x-amz-copy-source` header 不支持非 ASCII 字符，`CopySource` 路径部分必须 `encodeURIComponent`
12. **删除文件 path 未解码**：前端 `encodeURIComponent(file.key)` 编码的 `/`（`%2F`）在 Nuxt 路由参数中可能不被还原，服务端需 `decodeURIComponent`

## 定时任务

在 [nuxt.config.ts](nuxt.config.ts) 的 `nitro.scheduledTasks` 配置：

- `*/10 * * * *` → `source:clean_temp`：清理临时转存资源
- `*/5 * * * *` → `source:check_account`：检查网盘 Client 过期状态

## 测试

- 用 vitest，文件命名 `*.test.ts`
- 现有测试：
  - [app/utils/highlight.test.ts](app/utils/highlight.test.ts)
  - [server/utils/jieba.test.ts](server/utils/jieba.test.ts)
  - [server/utils/netDiskLinkValidator.test.ts](server/utils/netDiskLinkValidator.test.ts)
  - [shared/resource-file-types.test.ts](shared/resource-file-types.test.ts)

## 提交规范

- 提交前确保 `pnpm test` 通过
- 不要提交 `.env`、`prisma/generated/`、`.output/`、`node_modules/`
- 迁移文件一旦合并到主干，**禁止修改**，只能新增迁移
