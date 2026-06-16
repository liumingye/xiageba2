# 泡椒音乐下载网站

基于 NuxtJS 3 + Vue 3 + PostgreSQL 构建的音乐下载网站。

## 功能特性

### 前台功能
- 首页展示最新音乐（3×3 网格布局）
- 全文检索搜索（支持中文模糊匹配）
- 音乐详情页（封面、歌名、歌手、专辑、歌词）
- 在线播放（点击播放按钮才创建 audio 标签）
- 下载功能（支持多音质配置）
  - PC 端：显示二维码，切换音质时切换二维码
  - 移动端：直接显示下载链接
- SEO 优化（服务端渲染、Open Graph、JSON-LD）

### 后台管理
- 管理员登录（Token 鉴权）
- 音乐管理（添加、编辑、删除、分页）
- 管理员管理（添加、编辑用户名/密码）

## 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | NuxtJS | 3.11.x |
| UI 框架 | Vue | 3.4.x |
| 构建工具 | Vite | - |
| 样式 | TailwindCSS | 6.12.x |
| 状态管理 | Pinia | 2.1.x |
| 图标 | Lucide Vue | 0.366.x |
| ORM | Prisma | 6.5.x |
| 数据库 | PostgreSQL | 15+ |
| 二维码 | qrcode | 1.5.x |

## 项目结构

```
├── assets/css/          # 全局样式
├── components/          # 公共组件
│   ├── DownloadModal.vue   # 下载弹窗
│   └── SearchBar.vue       # 搜索栏
├── composables/         # 组合式函数
│   └── useAuth.ts          # 认证管理
├── lib/                 # 库文件
│   └── prisma.ts           # Prisma 客户端
├── pages/               # 页面组件
│   ├── index.vue           # 首页
│   ├── search.vue          # 搜索页
│   ├── music/[id].vue      # 音乐详情页
│   └── admin/              # 后台管理页面
│       ├── login.vue
│       ├── index.vue
│       ├── admins.vue
│       └── music/
├── prisma/              # 数据库配置
│   ├── schema.prisma       # Prisma 模型
│   └── migrations/         # 数据库迁移
├── public/              # 静态资源
├── scripts/             # 脚本
│   └── seed-admin.mjs      # 创建管理员
├── server/              # 服务端 API
│   ├── api/                # REST API
│   └── utils/              # 工具函数
├── stores/              # Pinia 状态
└── nuxt.config.ts       # Nuxt 配置
```

## 快速开始

### 环境要求

- Node.js ≥ 18.0.0
- PostgreSQL ≥ 15.0

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd music-download
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**

   创建 `.env` 文件（或修改已有文件）：
   ```env
   DATABASE_URL="postgresql://music:xkyWDtG5MJ2cpKnc@localhost:5433/music"
   ```

4. **初始化数据库**
   ```bash
   # 生成 Prisma Client
   npx prisma generate
   
   # 应用数据库迁移
   npx prisma migrate deploy
   
   # 创建默认管理员 (admin/admin)
   node scripts/seed-admin.mjs admin admin
   ```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:3000

### 生产构建

```bash
npm run build
npm run preview
```

## 数据库管理

### 迁移命令

```bash
# 查看迁移状态
npx prisma migrate status

# 创建新迁移
npx prisma migrate dev --name <migration-name>

# 应用迁移到生产环境
npx prisma migrate deploy

# 重置数据库（会清空所有数据）
npx prisma migrate reset --force
```

### 创建管理员

```bash
# 创建默认管理员
node scripts/seed-admin.mjs admin admin

# 创建自定义管理员
node scripts/seed-admin.mjs <username> <password>
```

## 搜索功能

系统使用 PostgreSQL 全文检索（FTS）实现高性能搜索：

- 中文 bigram 分词（无需安装扩展）
- GIN 索引加速查询
- 支持任意子串匹配（如搜索"周杰"可匹配"周杰伦"）

## 路由说明

| 路径 | 页面 | SSR |
|------|------|-----|
| `/` | 首页 | ✅ |
| `/search?q=关键词&page=1` | 搜索页 | ✅ |
| `/music/:id` | 音乐详情页 | ✅ |
| `/admin/login` | 后台登录 | ❌ |
| `/admin` | 后台首页 | ❌ |
| `/admin/music/add` | 添加音乐 | ❌ |
| `/admin/music/edit/:id` | 编辑音乐 | ❌ |
| `/admin/admins` | 管理员管理 | ❌ |

## 下载配置

音乐下载链接支持多种音质，存储为 JSON 格式：

```json
[
  {"quality": "FLAC", "url": "https://example.com/song.flac"},
  {"quality": "320K MP3", "url": "https://example.com/song.mp3"},
  {"quality": "128K MP3", "url": "https://example.com/song_low.mp3"}
]
```

## License

MIT
