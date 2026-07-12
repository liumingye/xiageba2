# 下歌吧

基于 **Nuxt 4 + Vue 3 + PostgreSQL + Prisma 7** 构建的音乐下载与网盘资源搜索网站。
支持 jieba 中文分词全文检索、多网盘资源转存、音乐刮削、后台管理。

## 功能特性

### 前台

- **首页**：最新上传音乐列表（SSR + ISR 缓存），分类浏览
- **搜索**：双模式搜索（音乐 / 资源），jieba 中文分词 + PostgreSQL GIN 索引全文检索，关键词高亮
  - 音乐搜索：默认精准搜索，可切换模糊匹配
  - 资源搜索：支持入库时间、网盘类型、排序方式、精准搜索等筛选条件
  - 全网搜：聚合多个搜索线路，自动检测网盘链接有效性
- **音乐详情**：封面、歌名、歌手、专辑、歌词、在线播放、多音质下载
- **资源详情**：网盘目录树预览、转存下载
- **下载弹窗**：PC 端显示二维码（切换音质自动切换），移动端直接跳转链接
- **豆瓣榜单**：电影、剧集、综艺、短剧分类浏览
- **SEO**：sitemap.xml、Open Graph、canonical URL、JSON-LD、`/s/关键词` 302 跳转搜索

### 后台管理 (`/admin`)

- 管理员登录（JWT Bearer Token 鉴权，scrypt 密码哈希）
- **音乐管理**：添加 / 编辑 / 删除 / 搜索分页 / 从酷我·网易云·QQ 音乐抓取
- **资源管理**：网盘资源 CRUD、分类管理、URL 去重校验
- **API 线路管理**：配置全网搜线路（JSON API / HTML 抓取 / pansou），在线测试
- **反馈管理**：用户反馈列表、状态处理、邮件通知
- **管理员管理**：账户增删改
- **系统维护**：重建搜索索引、清理 ISR 缓存

### 网盘集成

内置百度、夸克、UC、迅雷四大网盘 SDK（`packages/netdisk-sdk-js`），支持：

- 分享链接解析与转存
- 目录树预览
- 链接有效性检测（`usePanCheck` composable，支持 ids / urls 双模式）
- 网盘 Client 自动过期重建

### 性能与安全

- **限流**：`nuxt-api-shield` 按路径级配置请求频率与封禁策略
- **ISR**：首页和详情页增量静态化
- **Redis 缓存**：目录树、转存链接、配置数据缓存
- **参数化 SQL**：搜索与列表 API 使用 `pg` 原生参数化查询，无 SQL 注入风险
- **浏览器兼容**：`@vitejs/plugin-legacy` 兼容近 3 年浏览器

## 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | Nuxt 4.4 |
| UI 框架 | Vue 3.4 |
| 样式 | TailwindCSS 6.12 |
| 状态管理 | Pinia 3.0 |
| 图标 | Lucide Vue 1.22 |
| ORM | Prisma 7.8（Driver Adapter） |
| 数据库 | PostgreSQL 16+ |
| 中文分词 | @node-rs/jieba 2.x |
| 缓存 | Redis (ioredis) |
| 网盘 SDK | 自研 workspace 包（百度 / 夸克+UC / 迅雷） |
| 二维码 | qrcode |
| HTML 解析 | cheerio |
| 运行时 | Node.js 20+ |

## 项目结构

```
MUSIC/
├── app/                               # 业务代码（srcDir）
│   ├── assets/css/main.css               # 全局样式
│   ├── components/                       # 公共组件
│   │   ├── DownloadModal.vue             # 下载弹窗
│   │   ├── FeedbackModal.vue             # 反馈弹窗
│   │   ├── LocalResourceItem.vue         # 本地资源项
│   │   ├── WebSearchResults.vue          # 全网搜结果
│   │   ├── TopBar.vue / SearchBar.vue    # 顶栏 / 搜索栏
│   │   ├── Qrcode.vue / SiteFooter.vue   # 二维码 / 页脚
│   │   └── admin/                        # 后台组件
│   │       ├── AdminHeader.vue
│   │       ├── AdminNav.vue
│   │       ├── AdminPagination.vue
│   │       └── ScrapeModal.vue           # 音乐抓取弹窗
│   ├── composables/
│   │   ├── useAuth.ts                    # 管理员登录态
│   │   ├── useBackHistory.ts             # 返回按钮逻辑
│   │   ├── usePanCheck.ts                # 网盘链接检测
│   │   └── useToast.ts                   # 提示消息
│   ├── pages/
│   │   ├── index.vue                     # 首页
│   │   ├── search.vue                    # 搜索页（音乐 + 资源）
│   │   ├── music/[id].vue                # 音乐详情
│   │   ├── source/[id].vue               # 资源详情
│   │   ├── categorie/[id].vue            # 分类详情
│   │   └── admin/                        # 后台页面
│   │       ├── login.vue / index.vue
│   │       ├── account.vue / admins.vue
│   │       ├── resource.vue              # 资源管理
│   │       ├── apiList.vue               # API 线路管理
│   │       ├── category.vue              # 分类管理
│   │       ├── feedback.vue              # 反馈管理
│   │       ├── maintain.vue              # 系统维护
│   │       └── music/add.vue, edit/[id].vue
│   └── stores/                           # Pinia (music.ts, admin.ts)
│
├── server/                            # Nitro 服务端
│   ├── api/
│   │   ├── music/                        # 音乐 API
│   │   │   ├── search.get.ts             # 全文搜索（支持精准模式）
│   │   │   ├── recent.post.ts            # 首页最新
│   │   │   ├── [id].get.ts               # 音乐详情
│   │   │   └── feedback.post.ts          # 反馈提交
│   │   ├── source/                       # 资源 API
│   │   │   ├── search.get.ts             # 资源搜索（带筛选）
│   │   │   ├── geturl.ts                 # 转存获取下载链接
│   │   │   ├── tree.get.ts               # 目录树预览
│   │   │   ├── check.ts                  # 链接有效性检测
│   │   │   └── [id].get.ts               # 资源详情
│   │   ├── douban/index.get.ts           # 豆瓣榜单（电影/剧集/综艺/短剧）
│   │   ├── other/web_search.get.ts       # 全网搜
│   │   ├── category/                     # 分类 API
│   │   ├── image-proxy.get.ts            # 图片代理
│   │   └── admin/                        # 管理 API
│   │       ├── login.post.ts / index.ts  # 登录 / 管理员管理
│   │       ├── music/                    # 音乐 CRUD + 抓取 + 重建索引
│   │       ├── source/                   # 资源 CRUD + 重建索引
│   │       ├── apiList/                  # API 线路管理 + 测试
│   │       ├── category/                 # 分类管理
│   │       ├── feedback/                 # 反馈管理
│   │       ├── config/                   # 配置（accounts/aes/pancheck/redis）
│   │       └── cache/clear.post.ts       # 清理缓存
│   ├── routes/
│   │   ├── s/[keyword].ts                # /s/关键词 → 302 跳转搜索
│   │   └── sitemap.xml.ts                # 站点地图
│   ├── middleware/
│   │   └── admin-auth.ts                 # 管理员 Bearer Token 鉴权
│   ├── lib/
│   │   ├── prisma.ts                     # Prisma Client 单例
│   │   ├── redis.ts                      # Redis 连接
│   │   ├── pan.ts                        # 网盘 Client 管理（过期重建）
│   │   ├── pancheck.ts                   # 链接检测逻辑
│   │   ├── webSearch.ts                  # 全网搜引擎
│   │   ├── crypto.ts                     # URL 加解密
│   │   ├── configCache.ts                # 配置缓存（Map + TTL）
│   │   └── email.ts                      # 邮件通知
│   └── utils/
│       ├── auth.ts                       # JWT 生成与校验
│       ├── jieba.ts                      # 中文分词 + tsvector 构造
│       ├── password.ts                   # scrypt 密码哈希
│       ├── source.ts                     # 随机 IP/UA、目录树清理
│       ├── netDiskLinkValidator.ts       # 网盘链接校验
│       └── scraper/                      # 音乐抓取器
│           ├── kuwo/                     # 酷我音乐
│           ├── netease/                  # 网易云音乐
│           └── qq/                       # QQ 音乐
│
├── packages/netdisk-sdk-js/           # 网盘 SDK（pnpm workspace）
│   └── packages/
│       ├── baidu-sdk/                    # 百度网盘
│       ├── quarkuc-sdk/                  # 夸克 + UC
│       └── xunlei-sdk/                   # 迅雷
│
├── shared/utils/index.ts              # 共享工具（网盘类型识别）
├── prisma/                            # 数据库
│   ├── schema.prisma                     # 7 个模型 + GIN 索引
│   └── migrations/                       # 迁移历史
├── scripts/seed-admin.mjs             # 创建管理员脚本
├── public/                            # 静态资源
├── Dockerfile                         # 多阶段构建
├── docker-compose.yml                 # app + db
├── nuxt.config.ts                     # 路由规则 / 限流 / ISR
├── prisma.config.ts                   # Prisma 7 迁移配置
└── package.json
```

## 快速开始

### 环境要求

- **Node.js** ≥ 20.0
- **PostgreSQL** ≥ 15（推荐 16）
- **pnpm** ≥ 9
- **Redis**（可选，用于缓存）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

```ini
# 数据库
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=music
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/music?schema=public

# 管理员 JWT 签名密钥（生产环境必须修改）
ADMIN_SECRET=change-me-in-production

# 网站域名（用于邮件链接）
SITE_HOST=http://localhost:3000

# Nuxt 端口
NUXT_PORT=3000

# 邮件 SMTP（可选，用于反馈通知）
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com
SMTP_FROM_NAME=下歌吧
```

### 3. 初始化数据库

```bash
# 应用迁移
npx prisma migrate deploy

# 创建管理员（默认 admin/admin）
node scripts/seed-admin.mjs
# 或指定用户名密码
node scripts/seed-admin.mjs <username> <password>
```

> 密码使用 **scrypt** 哈希存储（N=2^14, r=8, p=1）。

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 <http://localhost:3000>

### 5. 构建生产版本

```bash
pnpm build
node .output/server/index.mjs
```

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

启动两个容器：

- `db`：PostgreSQL 16-alpine（健康检查通过后 app 才启动）
- `app`：Nuxt 生产镜像（端口映射 `5736:3000`）

访问 <http://localhost:5736>

## 配置说明

### 限流规则

在 [nuxt.config.ts](nuxt.config.ts) 的 `nuxtApiShield` 中配置：

```ts
nuxtApiShield: {
  global: { maxRequests: 30, windowSeconds: 60, cooldownSeconds: 60 },
  rules: [
    { path: "/api/music/search", maxRequests: 30, windowSeconds: 60, cooldownSeconds: 120 },
    { path: "/api/admin/login", maxRequests: 5, windowSeconds: 60, cooldownSeconds: 60 },
    { path: "/api/source/geturl", maxRequests: 10, windowSeconds: 30, cooldownSeconds: 120 },
    // ...
  ],
}
```

### 路由规则

| 页面 | SSR | ISR | 说明 |
|------|-----|-----|------|
| 首页 `/` | ✅ | 300 秒 | 增量静态化 |
| 详情页 `/music/:id` | ✅ | 30 天 | 静态化 |
| 搜索页 `/search` | ✅ | ❌ | 动态搜索 |
| 后台 `/admin/**` | ❌ | ❌ | SPA 模式 |

### 音乐下载配置

下载链接以 JSON 数组存储在 `downloads` 字段：

```json
[
  { "quality": "FLAC 无损", "url": "https://example.com/song.flac" },
  { "quality": "320K MP3", "url": "https://example.com/song.mp3" }
]
```

## 全文检索方案

采用 **应用层 jieba 分词 + PostgreSQL GIN 索引** 的混合方案：

1. **写入**：`buildTokens()` 对 title/artist/album（或资源 title/description/menu）做 jieba 分词，写入 `searchVector = to_tsvector('simple', tokens)`，建立 GIN 索引
2. **搜索**：`cutForSearch()` 对关键词分词，`plainto_tsquery('simple', $1)` 匹配；精准搜索用 `&`（AND），模糊搜索用 `|`（OR）
3. **管理工具**：后台"系统维护"页提供重建搜索索引功能

## 数据模型

| 模型 | 说明 |
|------|------|
| Admin | 管理员（scrypt 密码哈希） |
| Music | 音乐（含 downloads JSON、viewCount、searchVector） |
| Source | 网盘资源（含 url、fid、menu、status、invalidNum、searchVector） |
| Category | 分类 |
| Feedback | 用户反馈（含状态流转） |
| Config | 键值配置 |
| ApiList | 全网搜线路配置 |

## 常用命令

```bash
pnpm dev                    # 开发服务器
pnpm build                  # 构建生产版本
pnpm test                   # 运行测试
npx prisma migrate dev      # 创建新迁移
npx prisma migrate deploy   # 应用迁移
npx prisma studio           # 数据库可视化管理
node scripts/seed-admin.mjs # 创建管理员
```

## License

MIT
