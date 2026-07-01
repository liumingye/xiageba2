# 下歌吧 · 音乐下载网站

基于 **Nuxt 4 + Vue 3 + PostgreSQL + Prisma 7** 构建的中文音乐下载网站。
支持 jieba 中文分词的全文检索、多音质下载、后台管理与 Docker 一键部署。

## ✨ 功能特性

### 前台
- **首页**：最新上传音乐列表（SSR + ISR 缓存）
- **搜索**：jieba 中文分词 + PostgreSQL 全文检索，支持关键词模糊匹配（如 `周伦` 匹配 `周杰伦`）
- **音乐详情**：封面、歌名、歌手、专辑、歌词、在线播放、多音质下载
- **下载弹窗**：PC 端显示二维码（切换音质自动切换二维码），移动端直接跳转链接
- **骨架屏**：弱网环境下先显示骨架屏再填充数据
- **SEO**：完整 Open Graph / meta description / canonical URL / JSON-LD

### 后台管理 (`/admin`)
- 管理员登录（JWT Token 鉴权，HttpOnly Cookie 存储）
- 音乐管理：添加 / 编辑 / 删除 / 搜索分页
- 管理员管理：添加 / 编辑用户名和密码（SHA-256 加密存储）
- 系统维护：
  - 重建搜索索引（用 jieba 分词重新生成每条音乐的 search vector）
  - 清理 ISR 缓存（按路由粒度清理）
- 中间件 `admin-auth` 统一拦截 `/api/admin/**`

### 性能与安全
- **Rate Limit**：按 IP + 路由粒度限制请求频率（可配置）
- **ISR**：首页和详情页增量静态化，减轻数据库压力
- **Cache-Control**：公共 API 页面设置合理的 stale-while-revalidate

## 📦 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Nuxt | 4.4.x |
| UI 框架 | Vue | 3.4.x |
| 构建工具 | Vite | - |
| 样式 | TailwindCSS | 6.12.x |
| 状态管理 | Pinia | 2.1.x |
| 图标 | Lucide Vue | 0.366.x |
| ORM | Prisma | 7.8.x |
| 数据库连接 | @prisma/adapter-pg + pg | - |
| 中文分词 | @node-rs/jieba | 2.x（预编译原生库） |
| 二维码 | qrcode | 1.5.x |
| 数据库 | PostgreSQL | 15+ |
| 运行时 | Node | 20.x |

## 🏗️ 项目结构

```
MUSIC/
├── app/                            # 业务代码（srcDir）
│   ├── assets/css/main.css           # 全局样式
│   ├── components/                   # 公共组件
│   │   ├── DownloadModal.vue         # 下载弹窗
│   │   ├── SearchBar.vue             # 搜索栏
│   │   └── TopBar.vue                # 通用顶栏
│   ├── composables/                  # 组合式函数
│   │   ├── useAuth.ts                # 管理员登录态
│   │   └── useBackHistory.ts         # 返回按钮统一逻辑
│   ├── pages/                        # 页面 (Nuxt 文件路由)
│   │   ├── index.vue                 # 首页 (ISR)
│   │   ├── search.vue                # 搜索页 (SSR, 含错误适配)
│   │   ├── music/[id].vue            # 音乐详情页 (ISR)
│   │   └── admin/                    # 后台页面
│   │       ├── login.vue
│   │       ├── index.vue             # 音乐列表
│   │       ├── admins.vue            # 管理员列表
│   │       ├── maintain.vue          # 系统维护
│   │       └── music/
│   │           ├── add.vue
│   │           └── edit/[id].vue
│   ├── stores/                       # Pinia
│   │   ├── music.ts
│   │   └── admin.ts
│   ├── app.vue                       # 根组件
│   └── error.vue                     # 错误页
│
├── server/                         # Nitro 服务端
│   ├── api/                          # REST API
│   │   ├── music/
│   │   │   ├── [id].ts               # 音乐详情
│   │   │   ├── recent.ts             # 首页最新
│   │   │   └── search.ts             # 全文检索
│   │   ├── admin/
│   │   │   ├── login.ts              # 登录
│   │   │   ├── index.ts              # 管理员管理 + 音乐 CRUD
│   │   │   └── music/
│   │   │       └── rebuild-search.ts # 重建搜索索引
│   │   ├── cache/
│   │   │   └── clear.post.ts         # 清理 ISR 缓存
│   │   └── download/[id].ts          # 下载跳转
│   ├── middleware/                   # Nitro 中间件
│   │   ├── admin-auth.ts             # 管理员鉴权
│   │   └── rate-limit.ts             # 限流 (可路由独立配置)
│   ├── lib/
│   │   └── prisma.ts                 # Prisma Client 单例
│   └── utils/
│       ├── auth.ts                   # Token 生成与校验
│       └── jieba.ts                  # 中文分词 + 搜索 vector 构造
│
├── prisma/                         # 数据库
│   ├── schema.prisma                 # 模型定义
│   └── migrations/                   # 迁移（含 init / jieba 接入）
│
├── scripts/                        # seed 脚本
│   └── seed-admin.mjs                # 创建管理员
│
├── public/                         # 静态资源
│   ├── favicon.ico
│   ├── robots.txt
│   └── img/cover.png
│
├── Dockerfile                      # 多阶段构建
├── docker-compose.yml              # app + pg 一键启动
├── .dockerignore
├── .env.example                    # 环境变量示例
├── nuxt.config.ts                  # Nuxt 配置 (含路由规则 / ISR / headers)
├── prisma.config.ts                # Prisma 7 迁移配置 (adapter-pg)
├── tailwind.config.js
├── postbuild.mjs
├── tsconfig.json
└── package.json
```

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 20.0
- **PostgreSQL** ≥ 15（推荐 16）
- **pnpm** ≥ 9（Node 20 已自带）

### 1. 安装依赖

```bash
pnpm install
```

> `@node-rs/jieba` 是原生依赖，会自动下载对应平台的预编译二进制（Windows / macOS / Linux x64 & arm64），**无需额外安装编译工具**。

### 2. 配置环境变量

复制示例文件并按实际环境修改：

```bash
cp .env.example .env
```

`.env` 内容：

```ini
# 数据库连接字符串
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/music?schema=public

# 管理员 JWT 签名密钥（必须修改，强随机值）
ADMIN_SECRET=change-me-in-production

# 可选
NUXT_PORT=3000
```

### 3. 初始化数据库

```bash
# 应用所有迁移 (创建 Music / Admin 表与全文检索索引)
npx prisma migrate deploy

# 创建第一个管理员
node scripts/seed-admin.mjs admin admin
# 或自定义用户名 / 密码
node scripts/seed-admin.mjs <username> <password>
```

### 4. 启动开发服务器

```bash
pnpm run dev
```

访问 <http://localhost:3000>

### 5. 构建生产版本

```bash
pnpm run build
pnpm run preview     # 本地预览
```

生产运行方式：

```bash
node .output/server/index.mjs
# 或
PORT=3000 node .output/server/index.mjs
```

## 🐳 Docker 部署

复制示例文件并按实际环境修改：

```bash
cp .env.example .env
```

### docker-compose 一键启动

```bash
docker compose up -d --build
```

这会启动两个容器：

- `db`：PostgreSQL 16（健康检查通过后 app 才启动）
- `app`：Nuxt 生产镜像（自动执行 `prisma migrate deploy`，然后启动应用）

访问 <http://localhost:3000>

### 数据库初始化
```bash
npx prisma migrate deploy
```


## ⚙️ 配置说明

### Rate Limit 限流规则

编辑 [server/middleware/rate-limit.ts](server/middleware/rate-limit.ts) 的 `RULES` 数组：

```ts
const RULES: RateLimitRule[] = [
  { prefix: "/api/music/search", windowSeconds: 60, maxRequests: 30 },
  { prefix: "/api/music/recent", windowSeconds: 60, maxRequests: 10 },
  // 可继续添加其他路由
];
```

| 字段 | 含义 |
|------|------|
| `prefix` | 按前缀匹配，一条 URL 匹配多条规则时取最严格的那条 |
| `windowSeconds` | 窗口大小（秒） |
| `maxRequests` | 窗口内允许的最大请求数，超出返回 `429 Too Many Requests` |

### 路由规则（SSR / ISR / HTTP 头）

在 [nuxt.config.ts](nuxt.config.ts) 的 `routeRules` 中配置：

```ts
routeRules: {
  '/admin/**': { ssr: false },
  '/':        { ssr: true, isr: 60 },
  '/music/**':{ ssr: true, isr: 3600 },
  // ...
}
```

| 页面 | SSR | ISR | 说明 |
|------|-----|-----|------|
| 首页 `/` | ✅ | 60 秒 | 增量静态化，降低数据库压力 |
| 详情页 `/music/:id` | ✅ | 3600 秒 | 静态化 1 小时 |
| 搜索页 `/search` | ✅ | ❌ | 动态搜索，不走缓存 |
| 后台 `/admin/**` | ❌ | ❌ | SPA 模式 |

### 下载配置

音乐的下载链接支持多种音质，以 JSON 数组存储：

```json
[
  { "quality": "FLAC 无损", "url": "https://example.com/song.flac" },
  { "quality": "320K MP3",  "url": "https://example.com/song.mp3" },
  { "quality": "128K MP3",  "url": "https://example.com/song_low.mp3" }
]
```

在后台管理页"添加/编辑音乐"中直接粘贴 JSON 数组即可。

## 🛠️ 数据库与搜索

### 全文检索方案

采用 **应用层 jieba 分词 + PostgreSQL GIN 索引** 的混合方案：

1. **写入**：新建或编辑音乐时，`server/utils/jieba.ts` 的 `buildTokens()` 对 `title / artist / album` 做 jieba 精确分词，生成 tokens 字符串，由数据库写入 `searchVector = to_tsvector('simple', tokens)`，并为 `searchVector` 建立 GIN 索引。
2. **搜索**：查询时用 `tokenizeSearch()` 对用户关键词分词，然后 `plainto_tsquery('simple', tokens)` 匹配 `searchVector` 列；单字兜底确保"周伦"能匹配"周杰伦"。
3. **管理员工具**：后台 `/admin/maintain` 提供"**重建搜索索引**"按钮，调用 `/api/admin/music/rebuild-search` 全量刷新所有音乐的 `searchVector`。

### 常用数据库操作

```bash
# 查看当前迁移状态
npx prisma migrate status

# 创建新迁移（开发期）
npx prisma migrate dev --name <migration-name>

# 应用迁移到生产环境
npx prisma migrate deploy

# 重置数据库（清空全部数据，仅限开发）
npx prisma migrate reset --force

# 启动本地可视化管理 UI
npx prisma studio
```

### 创建管理员

```bash
node scripts/seed-admin.mjs <username> <password>
```

> 密码会经 **SHA-256** 哈希后存储，数据库中不存明文。

## 🛡️ 安全

- 所有 `/api/admin/**` 请求经过 `server/middleware/admin-auth.ts` 验证 Token
- 管理员登录使用 `ADMIN_SECRET` 签名 JWT，默认通过 HttpOnly Cookie 下发
- 所有管理员操作必须通过 `DATABASE_URL` 连接的数据库验证，不走前端持久化状态
- Rate Limit 中间件防止搜索和列表接口被高频刷量
- 搜索与列表 API 使用参数化 SQL（`pg` 的 `$1, $2...`），无 SQL 注入风险
- 建议生产前把 `ADMIN_SECRET` 换成强随机值（例如 `openssl rand -hex 32`）

## 🔗 路由清单

| 方法 | 路径 | 说明 |
|------|------|------|
| 页面 | `/` | 首页（最近音乐） |
| 页面 | `/search?q=关键词&page=1` | 搜索结果 |
| 页面 | `/music/:id` | 音乐详情 + 播放 + 下载 |
| 页面 | `/admin/login` | 后台登录 |
| 页面 | `/admin` | 音乐管理列表 |
| 页面 | `/admin/admins` | 管理员列表 |
| 页面 | `/admin/maintain` | 系统维护 |
| 页面 | `/admin/music/add` | 新增音乐 |
| 页面 | `/admin/music/edit/:id` | 编辑音乐 |
| API | `GET /api/music/recent` | 首页数据 |
| API | `GET /api/music/search` | 全文搜索（公开） |
| API | `GET /api/music/:id` | 音乐详情 |
| API | `GET /api/admin` | 管理员列表 |
| API | `POST /api/admin/login` | 登录 |
| API | `POST /api/admin` | 新增管理员 |
| API | `PUT /api/admin` | 修改管理员（用户名/密码） |
| API | `DELETE /api/admin` | 删除管理员 |
| API | `GET /api/admin/music` | 音乐列表 / 搜索 |
| API | `POST /api/admin/music` | 新增音乐 |
| API | `PUT /api/admin/music` | 编辑音乐 |
| API | `DELETE /api/admin/music` | 删除音乐 |
| API | `POST /api/admin/music/rebuild-search` | 重建搜索索引 |
| API | `POST /api/admin/cache/clear` | 清理 ISR 缓存 |

## 📄 License

MIT
