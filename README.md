# 下歌吧

## 项目简介

基于 **Nuxt 4 + Vue 3 + PostgreSQL + Prisma 7** 构建的网盘资源搜索与音乐下载网站。
支持 jieba 中文分词全文检索、多网盘（百度 / 夸克 / UC / 迅雷 / 光鸭 / 移动云盘）资源转存、音乐刮削、小说搜索、AI 搜索、微信公众号接入与完整后台管理。

## 分享赚钱

接入[「任推邦」](https://tg.bd.cn/#/pages/login/register?from=baidu&ref=tg.bd.cn&uid=nologin&os=web&qd=self_team_android&t=1791520394299&_nc=hw_db_itab&_r=activity&sid=sg_sign&sign=202cb962ac59075b964b07152d234b70&invite_code=3832491&register=0)推广平台，分享链接邀请新用户即可赚取推广佣金。

![分享赚钱 - 任推邦](https://raw.githubusercontent.com/liumingye/xiageba2/refs/heads/main/img/20261007164149437.png)

- **500+ 网推项目**：项目丰富、价格置顶、数据精准
- **累计发佣突破 5 亿元**：APP 项目拉新佣金稳定可靠
- **零费用入驻**：平台承诺不收取任何入驻 / 做单费用

扫码或[点击链接注册](https://tg.bd.cn/#/pages/login/register?from=baidu&ref=tg.bd.cn&uid=nologin&os=web&qd=self_team_android&t=1791520394299&_nc=hw_db_itab&_r=activity&sid=sg_sign&sign=202cb962ac59075b964b07152d234b70&invite_code=3832491&register=0)查看项目详情，助力中小达人成长变现。

---

## 界面预览

前台：

<div align="center">
  <img src="img/1.jpeg" width="32%" alt="前台 - 首页" />
  <img src="img/2.jpeg" width="32%" alt="前台 - 搜索结果" />
  <img src="img/3.jpeg" width="32%" alt="前台 - 资源详情" />
</div>

后台管理：

<div align="center">
  <img src="img/admin-1.jpeg" width="32%" alt="后台 - 登录" />
  <img src="img/admin-2.jpeg" width="32%" alt="后台 - 音乐管理" />
  <img src="img/admin-3.jpeg" width="32%" alt="后台 - 资源管理" />
</div>

---

## 核心功能

### 前台

| 模块 | 说明 |
|------|------|
| 首页 `/` | 最新音乐、热搜词、分类导航、豆瓣榜单（电影 / 剧集 / 综艺 / 短剧），SSR + ISR 缓存 |
| 搜索 `/search` | 双模式（音乐 / 资源）切换，jieba 分词 + PostgreSQL GIN 全文检索，关键词高亮、无限滚动 |
| 音乐详情 `/music/:id` | 封面、歌名、歌手、专辑、歌词、在线试听、多音质下载 |
| 资源详情 `/source/:id` | 网盘目录树预览、转存下载、失效链接标记 |
| 小说 `/book` | 百度网盘公开小说检索、书籍详情、在线试读、提取码获取 |
| 分类 `/categorie/:id` | 按分类浏览资源 |
| 公告 `/announcement` | 公告列表与详情，支持普通 / 横幅 / 弹窗三种展示形态 |
| 静态页 `/page/*` | 用户协议、隐私政策、免责声明、版本记录、屏蔽词公示 |
| 下载弹窗 | PC 端展示二维码（切换音质自动换码），移动端直接跳转链接 |
| AI 搜索 | 大模型 Agent 调用站内检索工具，SSE 流式返回结果 |

### 后台管理 `/admin`

后台为 SPA 模式（`ssr: false`），使用独立 `admin` 布局，登录页单独 SSR。
鉴权方式：JWT 双 token（`ADMIN_SECRET` 签名），密码使用 **scrypt** 哈希存储。

- `accessToken` 有效期 1 小时，随请求头 `Authorization: Bearer` 发送
- `refreshToken` 有效期 7 天，仅用于 `POST /api/admin/refresh` 换取新令牌，不能访问业务接口
- 前端 axios 拦截器在 access 剩余不足 5 分钟时主动续期；遇到 401 也会自动刷新并重放原请求，用户无感
- 刷新会轮转 refreshToken，但继承原会话的绝对过期点：7 天内活跃可持续续期，超过 7 天必须重新登录
- 令牌带管理员 ID 与密码指纹，每次请求到库里核对：**管理员被删除、或密码被修改后，其已签发的 access / refresh 令牌立即失效**（下一次请求即返回 401，需重新登录）

| 分组 | 页面 | 说明 |
|------|------|------|
| 内容 | 音乐管理、音乐添加 / 编辑、资源管理 | 音乐与网盘资源 CRUD、搜索分页、URL 去重校验、批量导入 |
| 内容 | 分类管理、公告管理、反馈管理 | 分类维护；公告编辑；用户反馈流转 + 邮件通知 |
| 运营 | 账号管理、接口配置 | 网盘多账号维护（百度 OAuth 授权）；全网搜线路配置（JSON API / HTML 抓取），支持在线测试 |
| 存储 | 存储配置、文件管理 | S3 / 对象存储配置与文件上传、预览、选择器 |
| 系统 | AI 搜索、加密、过滤、热搜词、网盘检测、Redis、公众号、SEO、系统维护 | 站点级配置，均落库到 `Config` 表；系统维护含重建搜索索引、清理缓存 |

### 网盘集成

网盘 SDK 以 pnpm workspace 包形式内置在 `packages/netdisk-sdk-js/`：

| 包 | 网盘 |
|----|------|
| `@netdisk-sdk/baidu-sdk` | 百度网盘 |
| `@netdisk-sdk/quarkuc-sdk` | 夸克网盘 + UC 网盘 |
| `@netdisk-sdk/xunlei-sdk` | 迅雷云盘 |
| `@netdisk-sdk/guangya-sdk` | 光鸭云盘 |
| `@netdisk-sdk/c139-sdk` | 中国移动云盘 |
| `@netdisk-sdk/utils` | 公共工具 |

能力：分享链接解析与转存、目录树预览、链接有效性检测（前端 `usePanCheck` 视口懒检测，滚动停止后才送检当前视口内的链接，支持 `ids` / `urls` 双模式）、多账号轮换与过期重建、账号失效定时巡检与通知。

`/api/source/geturl` 仅处理白名单域名（`pan.quark.cn`、`pan.baidu.com`、`drive.uc.cn`、`pan.xunlei.com`），其余域名直接返回原链接。

### 检索方案

应用层 jieba 分词 + PostgreSQL `tsvector` / GIN 索引：

1. **写入**：`buildTokens()` 对标题、歌手、专辑（资源为标题、描述、目录）做 jieba 分词，写入 `searchVector`
2. **查询**：`analyzeQuery()` 分词 → 识别冗余词 / 重复词 / 别名 → 生成**召回阶梯** → `to_tsquery('simple', $1)` 匹配
3. **精准模式**：所有词 AND；默认模式按 `exact → core → relaxed → loose` 四级阶梯召回，tier 作为排序第一优先级
4. 后台「系统维护」提供音乐 / 资源搜索索引重建接口，带进度查询

> ⚠️ **必须用 `to_tsquery`，不要用 `websearch_to_tsquery`**：后者会静默丢弃括号，
> `A (B OR C)` 被解析成 `'A' & 'B' | 'C'` ≡ `(A & B) | C`，模糊搜索会退化成"命中 C 即返回"。

**排序规则**（音乐搜索，优先级从高到低）：

| 优先级 | 规则 | 分值 |
| --- | --- | --- |
| 1 | 召回 tier（完全匹配 → 核心匹配 → 宽松匹配 → 兜底） | 升序 |
| 2 | 标题 / 歌手 / 专辑 归一化后完全等于查询串 | 1000 / 900 / 850 |
| 3 | 整串被标题 / 歌手 / 专辑包含 | 400 / 260 / 200 |
| 4 | 覆盖度：逐词 `字符数 × 出现次数`（重复词权重翻倍） | 累加 |
| 5 | `ts_rank(searchVector, tsquery, 1)` | — |
| 6 | `viewCount` → `createdAt` | 兜底 |

**冗余词表**：`server/utils/jieba.ts` 的 `FILLER_WORDS`（我 / 的 / 听 / 一下 / 音乐 …），只降级为"非必命中"，不丢弃。
**别名表**：`server/utils/search-alias.ts` 的 `SEARCH_ALIASES`，查询端 OR 扩展，无需重建索引。

### 性能与安全

- **限流**：`nuxt-api-shield`，全局 30 次 / 60 秒，按路径配置频率与封禁时长
- **ISR / 缓存**：首页 ISR 300 秒；Nitro `defineCachedEventHandler` 缓存搜索结果；Redis 缓存目录树、转存链接、配置数据
- **PWA**：`@vite-pwa/nuxt`，仅提供安装能力（manifest + 图标，Chrome 112+ 安装不依赖 Service Worker）；SW 零缓存：不预缓存、不拦截请求，`cleanupOutdatedCaches` 负责清理历史缓存（开发环境关闭）
- **参数化 SQL**：搜索与列表使用 `pg` / Prisma 参数化查询，无字符串拼接
- **屏蔽词**：自实现 AC 自动机（`server/lib/simpleAC.ts`），零外部依赖
- **浏览器兼容**：生产构建启用 `@teages/nuxt-legacy` + `@vitejs/plugin-legacy`，目标 Chrome ≥ 87 / Safari ≥ 12 / iOS ≥ 12

## 开放 API

面向第三方程序（脚本、采集器等）的接口，前缀 `/api/open`，通过 API Token 鉴权。

### 启用与鉴权

- 后台「安全配置」→「开放 API」→ 点「随机生成」→「保存」。Token 存于 `Config` 表 `api_token`，**留空保存即关闭开放 API**，修改后立即生效
- 请求头：`Authorization: Bearer <API Token>`（`Bearer` 大小写不敏感）
- 错误码：未配置 Token → `403`；缺少 / 错误 Token → `401`（附 `WWW-Authenticate: Bearer`）
- `/api/open/**` **未登记限流规则**，调用方请自行控制频率

```bash
curl "https://example.com/api/open/music/search?q=周杰伦&pageSize=5" \
  -H "Authorization: Bearer <API Token>"
```

所有列表接口统一分页信封：

```json
{ "data": [], "total": 0, "page": 1, "pageSize": 20, "totalPages": 0 }
```

错误响应为 h3 默认格式，`data` 字段在部分错误中携带附加信息（如重复列表）：

```json
{ "statusCode": 409, "message": "1 个资源地址已存在", "data": { "duplicates": [] } }
```

### 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/open/source` | 增加资源（支持批量） |
| `GET` | `/api/open/source/search` | 搜索资源（仅启用状态） |
| `POST` | `/api/open/music` | 增加音乐 |
| `GET` | `/api/open/music/search` | 搜索音乐（仅启用状态） |

与后台共用同一套创建 / 检索逻辑（`server/lib/sourceService.ts`、`server/lib/musicService.ts`），去重与分词规则完全一致。

### 增加资源 `POST /api/open/source`

请求体（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 资源名称 |
| `urls` | string[] | 是 | 网盘链接，自动 trim、去重、去空 |
| `cid` | number | 否 | 分类 ID |
| `description` | string | 否 | 描述，默认空 |
| `menu` | string | 否 | 目录树文本，默认空 |
| `isSelf` | boolean | 否 | 是否自有资源，默认 `false` |
| `force` | boolean | 否 | 地址已存在时仍插入新记录 |
| `updateExisting` | boolean | 否 | 地址已存在时用本次数据覆盖 |
| `skipDuplicates` | boolean | 否 | 跳过已存在的地址，只插入新地址 |

去重按 `url` 精确匹配。命中重复且未传上述三个标志时返回 `409`，`data.duplicates` 为 `[{ id, title, url }]`，由调用方决定处理方式后重发。

响应：

```json
{ "success": true, "inserted": 1, "updated": 0, "duplicate": 0, "failed": 0 }
```

新建资源默认 `status = 1`（直接上架）。

### 搜索资源 `GET /api/open/source/search`

| 参数 | 必填 | 说明 |
|------|------|------|
| `q` | 是 | 关键词，最多 200 字符 |
| `cid` | 否 | 分类 ID |
| `page` | 否 | 页码，默认 1 |
| `pageSize` | 否 | 每页条数，默认 20，最大 50 |

`q` 为 `http(s)://` 开头时按链接精确匹配，为 24 位资源 ID 时按 ID 精确匹配，否则 jieba 分词全文检索并按相关度排序。只返回 `status = 1` 的资源。

`data[]` 字段：`id`、`cid`、`title`、`url`、`description`、`menu`、`isSelf`、`status`、`createdAt`。

### 增加音乐 `POST /api/open/music`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 歌名 |
| `artist` | string | 是 | 歌手 |
| `album` | string | 否 | 专辑，默认空 |
| `cover` | string | 否 | 封面地址，默认空 |
| `lyrics` | string | 否 | 歌词，默认空 |
| `playUrl` | string | 否 | 试听地址，默认空 |
| `downloads` | array | 否 | 下载列表，默认 `[]` |

`downloads` 元素结构：`{ "quality": "FLAC", "url": "https://...", "source": "kuwo", "sourceId": "xxx" }`（`source`、`sourceId` 可选；接口不校验元素结构，请保证 `quality`、`url` 有值）。音乐没有唯一约束，重复提交会产生重复记录。

响应为完整的音乐记录（含 `id`、`status`、`createdAt` 等），默认 `status = 1`（直接上架）。

### 搜索音乐 `GET /api/open/music/search`

| 参数 | 必填 | 说明 |
|------|------|------|
| `q` | 是 | 关键词，最多 64 字符 |
| `page` | 否 | 页码，默认 1 |
| `pageSize` | 否 | 每页条数，默认 20，最大 50 |

jieba 分词后以 OR 宽泛匹配，按相关度排序。只返回 `status = 1` 的音乐。

`data[]` 字段：`id`、`title`、`artist`、`album`、`cover`、`lyrics`、`playUrl`、`downloads`、`viewCount`、`status`、`createdAt`。

## 技术栈

| 分类 | 技术 | 版本（package.json） |
|------|------|--------------------|
| 框架 | Nuxt | ^4.5.2 |
| 前端 | Vue | ^3.5.43 |
| UI 库 | @nuxt/ui | ^4.11.2 |
| 样式 | Tailwind CSS | ^4.3.3 |
| 图标 | @lucide/vue | ^1.48.0 |
| 状态管理 | Pinia + @pinia/nuxt | ^3.0.4 |
| 组合式工具 | @vueuse/core | ^14.3.0 |
| Markdown | @comark/nuxt（含 shiki 高亮） | 0.6.2 |
| PWA | @vite-pwa/nuxt | ^1.1.1 |
| 兼容 | @teages/nuxt-legacy + @vitejs/plugin-legacy | ^3.0.1 / ^8.2.3 |
| ORM | Prisma（Driver Adapter `@prisma/adapter-pg`） | ^7.8.0 |
| 数据库 | PostgreSQL | ≥ 15 |
| 中文分词 | @node-rs/jieba | ^2.0.3 |
| 缓存 | ioredis（可选） | ^5.11.1 |
| 对象存储 | @aws-sdk/client-s3 | ^3.1141.0 |
| HTTP | axios（后台统一封装 `app/utils/request.ts`） | ^1.20.0 |
| 其他 | cheerio、qrcode、nodemailer、openai、opencc-js、xlsx | — |
| 测试 | Vitest | ^4.1.11 |
| 类型 | TypeScript | ^6.0.3 |
| 包管理 | pnpm | 10.21.0 |

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20 | `package.json` 未声明 `engines`；Dockerfile 固定 `node:20-slim` |
| pnpm | 10.21.0 | `packageManager` 字段锁定，workspace 协议依赖，**不要用 npm / yarn** |
| PostgreSQL | ≥ 15 | 需要 `tsvector` / GIN 支持 |
| Redis | 可选 | 不配置则跳过缓存，应用可正常运行 |

## 安装与常用命令

```bash
pnpm install          # 安装依赖（含 workspace 网盘 SDK）
pnpm dev              # 开发服务器（nuxt dev --host）
pnpm build            # 构建生产版本到 .output/
pnpm preview          # 本地预览生产构建
pnpm test             # 运行 Vitest 测试（vitest run）
pnpm prisma:generate  # 重新生成 Prisma Client
pnpm prisma:migrate   # 应用迁移（prisma migrate deploy）
```

> `postinstall` 会自动执行 `nuxt prepare`。
> **没有配置 lint 脚本**，代码风格靠约定与 TypeScript 检查。

其他常用命令（直接用 `npx` / `node` 执行）：

```bash
npx prisma migrate dev --name <name>   # 创建并应用新迁移（禁止 db push）
npx prisma studio                      # 数据库可视化管理
node scripts/seed-admin.mjs [user] [pass]   # 创建管理员，默认 admin / admin
```

## 目录结构

```
.
├── app/                                # 业务代码（Nuxt 4 默认 srcDir）
│   ├── app.vue / app.config.ts / error.vue
│   ├── assets/css/main.css             # 全局样式
│   ├── layouts/                        # default.vue（前台壳）/ admin.vue（后台）
│   ├── components/                     # 自动导入组件
│   │   ├── SearchBar.vue / SearchBarBig.vue / SearchSuggestions.vue
│   │   ├── LocalResourceItem.vue / WebSearchResults.vue
│   │   ├── DownloadModal.vue / DownloadLinkPanel.vue / Qrcode.vue
│   │   ├── AiChat.vue / FeedbackModal.vue / AnnouncementDisplay.vue
│   │   ├── SampleReadModal.vue / GetCodeModal.vue    # 小说试读 / 提取码
│   │   ├── Pagination.vue / InfiniteLoad.vue / ThemeSwitcher.vue
│   │   ├── Editor.vue / MultiSelectCombobox.vue / BrowserCompatCheck.vue
│   │   └── admin/                      # AdminHeader / AdminNav / AdminPagination
│   │                                  # ScrapeModal / FilePickerModal / DirPickerModal / AmbientCanvas
│   ├── composables/                    # useAuth / usePanCheck / useToast
│   │                                  # useSiteSeo / useThemeConfig / useFunnyLoading
│   ├── pages/
│   │   ├── index.vue / search.vue
│   │   ├── music/[id].vue / source/[id].vue / categorie/[id].vue
│   │   ├── book/index.vue / book/[id].vue           # 小说
│   │   ├── announcement/index.vue / announcement/[id].vue
│   │   ├── page/                       # policy / agree / privacy-policy / version / forbidden-keywords
│   │   └── admin/                      # login.vue index.vue(音乐) resource.vue category.vue
│   │                                  # apiList.vue feedback.vue announcement.vue account.vue admins.vue
│   │                                  # music/add.vue music/edit/[id].vue
│   │                                  # storage/{config,files}.vue
│   │                                  # system/{ai-search,aes,filter,hotwords,pancheck,redis,wechat,maintain}.vue
│   ├── plugins/theme-config.client.ts  # 主题色持久化 + oklch 降级
│   ├── stores/                         # Pinia：admin.ts / music.ts
│   └── utils/                          # request.ts（axios 封装）/ comark.ts / highlight.ts
│                                       # pan.ts / file.ts / purifyUrl.ts / announcement.ts / index.ts
│
├── server/                             # Nitro 服务端
│   ├── api/
│   │   ├── music/                      # search.get / recent.get / [id].get / feedback.post
│   │   ├── source/                     # search.get / [id].get / geturl / tree.get / check
│   │   ├── novel/                      # search.post / list.get / [id].get / sample-read.post / get-code.post
│   │   ├── other/web_search.get.ts     # 全网搜（SSE 流式）
│   │   ├── ai-search.ts                # AI 搜索（SSE 流式）
│   │   ├── home/                       # 首页聚合接口
│   │   │   ├── douban.get.ts           # 豆瓣榜单
│   │   │   └── bangumi.get.ts          # 番组放送（bgmapi 每日放送表）
│   │   ├── category/ announcement/     # 分类 / 公告
│   │   ├── wechat.ts                   # 微信公众号消息接口（GET 校验 + POST 处理）
│   │   ├── site-seo.get.ts / hotwords.get.ts / forbidden-keywords.get.ts / image-proxy.get.ts
│   │   └── admin/                      # 后台 API（经 admin-auth 中间件）
│   │       ├── login.post.ts / index.ts / accounts/ / cache/clear.post.ts
│   │       ├── music/                  # CRUD + scrape + check-links + rebuild-search
│   │       ├── source/                 # CRUD + batch + import + rebuild-search
│   │       ├── apiList/ category/ feedback/ announcement/
│   │       ├── config/                 # ai-search / ad-filter / web-search-filter / aes
│   │       │                           # pancheck / redis / hotwords / site-seo / wechat
│   │       ├── baidu/                  # 百度 OAuth 授权
│   │       ├── storage/                # config/ files/ files/upload
│   │       └── list-dir.get.ts / check-account.get.ts
│   ├── lib/                            # prisma / redis / s3 / configCache / accountCache
│   │                                   # pan-instance / pan-check / pan-info / geturl-record
│   │                                   # webSearch / email / crypto / simpleAC / aiClient
│   │                                   # wechatConfig / const
│   ├── middleware/                     # admin-auth.ts / wechat-verify.ts
│   ├── plugins/timezone.ts             # 服务端时区固定 Asia/Shanghai
│   ├── routes/                         # sitemap.xml.ts / robots.txt.ts / s/[keyword].ts
│   ├── tasks/source/                   # clean_temp.ts / check_account.ts（Nitro 定时任务）
│   └── utils/                          # jieba / auth / password / queue / cache / source
│       │                               # novel / scraper
│       └── scraper/                    # kuwo / netease / qq 音乐抓取器
│
├── shared/                             # 前后端共享：utils/index.ts、resource-file-types.ts
├── packages/netdisk-sdk-js/            # 网盘 SDK（pnpm workspace）
│   └── packages/{baidu,c139,guangya,quarkUC,xunlei}-sdk + utils
├── prisma/                             # schema.prisma + migrations/
├── scripts/seed-admin.mjs              # 创建管理员
├── public/                             # favicon、img/、pwa/ 图标
├── nuxt.config.ts                      # 模块 / 限流 / PWA / 路由规则 / 定时任务
├── prisma.config.ts                    # Prisma 7 配置（ESM，读取 DATABASE_URL）
├── vitest.config.ts                    # 测试配置（映射 #server / #shared 别名）
├── postbuild.mjs                       # 构建后把 prisma/ scripts/ 拷进 .output/server
├── Dockerfile                          # 多阶段构建（node:20-slim）
└── docker-compose.yml                  # db + app
```

路径别名：`~/` `@/` → `app/`；`#server/` → `server/`；`#shared/` → `shared/`。

## 环境变量配置

复制模板后按需修改：

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串，例：`postgresql://user:pass@localhost:5432/music?schema=public` |
| `ADMIN_SECRET` | ✅ | 后台 JWT 与验证码通行令牌的签名密钥，**生产环境必须修改**，无硬编码兜底；未设置或仍是 `.env.example` 的占位值时拒绝签发和校验令牌 |
| `SITE_HOST` | 建议 | 站点域名（如 `https://example.com`），用于邮件链接、微信回调、AI 搜索结果链接 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_FROM_NAME` | 可选 | 反馈处理完成后的邮件通知，不配置则不发信 |
| `MEOW_API` | 可选 | 网盘账号失效时的推送通知接口（定时任务 `source:check_account`） |
| `QQ_MUSIC_COOKIE` | 可选 | QQ 音乐抓取器使用的 Cookie |
| `AI_SEARCH_TIMEOUT_MS` | 可选 | AI 请求超时毫秒数，缺省 600000 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Docker | `docker-compose.yml` 中 db 服务读取 |
| `NUXT_PORT` | 可选 | 开发 / 运行端口，默认 3000 |
| `TZ` | 自动 | 由 `server/plugins/timezone.ts` 强制设为 `Asia/Shanghai` |

**注意**：Redis、AI 搜索、加密密钥、屏蔽词、热搜词、SEO、公众号等配置均存放在数据库 `Config` 表中，通过后台「系统」页面维护，不通过环境变量配置。

## 数据库

Prisma 7 使用 Driver Adapter（`@prisma/adapter-pg`），`new PrismaClient()` 必须传 adapter。
Client 生成到 `prisma/generated/`，代码中以 `@@/prisma/generated` 导入。

```bash
# 应用迁移（禁止 prisma db push）
npx prisma migrate deploy
# 或
pnpm prisma:migrate

# 修改 schema 后创建新迁移
npx prisma migrate dev --name <name>
```

| 模型 | 说明 |
|------|------|
| Admin | 管理员，scrypt 密码哈希 |
| Music | 音乐：`downloads`（JSON）、`lyrics`、`playUrl`、`viewCount`、`searchVector`（GIN） |
| Source | 网盘资源：`url`、`cid`、`menu`、`status`、`invalidNum`、`isSelf`、`searchVector` |
| Category | 分类，含 `sort`、`isShow` |
| Feedback | 用户反馈，含类型枚举与状态流转 |
| Config | 键值配置表 |
| ApiList | 全网搜线路配置（含 HTML 抓取字段映射） |
| Announcement | 公告，含展示形态 / 图标 / 状态枚举 |
| PanAccount | 网盘多账号（cookie / token / 临时目录 / 启停） |
| SourceTemp | 转存临时记录，由定时任务清理 |
| S3Config / StorageFile | 对象存储配置与文件记录（软删除：`isHidden` / `isDeleted`） |

## 构建与部署

### 本地生产运行

```bash
pnpm install
pnpm build
node .output/server/index.mjs
```

`postbuild.mjs` 会把 `prisma/` 与 `scripts/` 复制进 `.output/server/`，便于容器内执行迁移与初始化脚本。

### Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

| 服务 | 说明 |
|------|------|
| `db` | `groonga/pgroonga:4.0.6-alpine-18`，数据卷 `pgdata`，健康检查通过后 `app` 才启动 |
| `app` | 多阶段构建镜像，容器启动命令：`npx prisma migrate deploy && node .output/server/index.mjs` |

端口映射 `5736:3000`，访问 <http://localhost:5736>。

Dockerfile 要点：`node:20-slim` 构建与运行 → corepack 激活 pnpm 10.21.0 → `pnpm install --frozen-lockfile` → `prisma generate` → `pnpm build` → `postbuild.mjs` → `pnpm prune --prod` → 运行阶段重新 `prisma generate`（`debian-openssl-3.0.x` 二进制兼容）。

### 路由与渲染规则

| 路径 | 规则 |
|------|------|
| `/` | SSR + ISR 300 秒，带 `Cache-Control` |
| `/music/**`、`/source/**`、`/search` | SSR |
| `/admin/**` | `ssr: false`，使用 `admin` 布局 |
| `/admin/login` | SSR，不套布局 |
| `/img/**`、`/pwa/**` | 静态资源，强缓存 |
| `/sw.js` | 禁用缓存 |
| `/manifest.webmanifest` | 缓存 1 天 |

### 限流规则

配置在 `nuxt.config.ts` 的 `modules` 数组中 `nuxt-api-shield` 的内联选项里（不是顶层 `nuxtApiShield` 字段）：

- 全局：30 次 / 60 秒，封禁 60 秒
- `/api/admin/login`：5 次 / 60 秒
- `/api/music/search`、`/api/source/search`：30 次 / 60 秒，封禁 180 秒
- `/api/source/geturl`、`/api/source/tree`：15 次 / 30 秒
- `/api/ai-search`：10 次 / 30 秒
- `/api/music/feedback`：10 次 / 300 秒
- `/api/open/**`（开放 API）：未登记限流
- IP 识别顺序：`X-Forwarded-For` → `X-Real-IP` → `socket.remoteAddress`

### 定时任务

Nitro `experimental.tasks` + `scheduledTasks`：

| 表达式 | 任务 | 说明 |
|--------|------|------|
| `*/10 * * * *` | `source:clean_temp` | 清理网盘临时转存目录记录 |
| `*/5 * * * *` | `source:check_account` | 巡检网盘账号状态，失效时推送通知 |

## 测试

```bash
pnpm test
```

Vitest 独立配置（`vitest.config.ts`），`environment: node`，通过显式别名解析 `#server/*`、`#shared/*` 与 workspace 网盘 SDK，无需启动 Nuxt dev server。测试超时 15 秒（scrypt 相关用例较慢）。

## License

MIT
