import type { OpenAI } from "openai";
import { Pool } from "pg";
import { prisma } from "#server/lib/prisma";
import { getAiChatClient } from "#server/lib/aiClient";
import "dotenv/config";
import { cutForSearch, buildTsQuery } from "#server/utils/jieba";
import { PAN_HOST_MAP } from "#server/api/source/search.get";
import { Readable } from "stream";
import { aiRequestQueue } from "#server/utils/queue"; // 引入刚才写的排队机
import { getAiSearchConfig } from "#server/api/admin/config/ai-search";
import { getStorageTypeFriend } from "#shared/utils";
import type { PanFilter } from "#shared/utils";
import { searchExaWeb } from "#server/lib/exaSearch";

const siteHost = process.env.SITE_HOST || "";

/** 用户输入的最大长度（字符）。防费用放大 + 防超长上下文拖垮排队机 */
const MAX_MESSAGE_LENGTH = 500;
const MIN_MESSAGE_LENGTH = 2;

/**
 * 多轮对话的历史规模上限。
 * 上下文不是越多越好：system prompt + 工具定义已经占了大量 token，
 * 无脑带全量历史只会放大费用、稀释当前轮的指令遵循能力。
 */
const MAX_HISTORY_MESSAGES = 12;
/** 历史里 assistant 单条截断长度。回复尾部附带的资源链接列表很长，截断保留近期语义即可 */
const MAX_HISTORY_ASSISTANT_LENGTH = 800;

// 保持同一个连接池，或者引用你全局的 pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 100 });

/**
 * 专供大模型 Agent 调用的底层数据库检索函数
 * 剃除了分页、时间筛选、目录树、复杂打分等无意义字段，只召回 Top 6 最匹配的纯净结果
 */
async function searchSourcesForAi(keyword: string, panType: PanFilter = "all") {
  const term = keyword?.trim() || "";
  if (!term) return [];

  // 1. 结巴分词与核心词提取
  const keywordTokens = cutForSearch(term);
  if (keywordTokens.length === 0) return [];

  const keywordWebQuery = buildTsQuery(keywordTokens, false);
  const tokens = [...keywordTokens];

  // 2. 动态构造 SQL 条件与参数
  const baseParams: any[] = [];
  let paramIndex = 1;
  const conditions: string[] = [];

  // 网盘渠道过滤
  const panFilter = panType in PAN_HOST_MAP ? panType : "all";
  const panHosts = PAN_HOST_MAP[panFilter];
  if (panHosts && panHosts.length > 0) {
    const likeConditions = panHosts.map((host) => {
      baseParams.push(`https://${host}/%`);
      return `url LIKE $${paramIndex++}`;
    });
    conditions.push(`(${likeConditions.join(" OR ")})`);
  }

  // 核心文本/向量检索式
  const queryParamIndex = paramIndex++;
  baseParams.push(keywordWebQuery);
  const searchQueryExpression = `to_tsquery('simple', $${queryParamIndex})`;
  conditions.push(`"searchVector" @@ search_query.value`);

  // 拼接完整的 WHERE
  const whereClause = `WHERE "status" = 1 AND ${conditions.join(" AND ")}`;

  // 3. 构造打分机制（直接复用你成熟的排序逻辑）
  const dataParams = [...baseParams];
  const normalizedTermIndex = paramIndex++;
  dataParams.push(term.toLocaleLowerCase());

  const titleTokenScore = tokens
    .map((token) => {
      const tokenIndex = paramIndex++;
      dataParams.push(token.toLocaleLowerCase());
      const tokenWeight = Array.from(token).length;
      return `CASE WHEN strpos(lower(title), $${tokenIndex}) > 0 THEN ${tokenWeight} ELSE 0 END`;
    })
    .join(" + ");

  const orderClause = `
    CASE
      WHEN lower(btrim(title)) = $${normalizedTermIndex} THEN 3
      WHEN strpos(lower(title), $${normalizedTermIndex}) = 1 THEN 2
      WHEN strpos(lower(title), $${normalizedTermIndex}) > 0 THEN 1
      ELSE 0
    END DESC,
    (${titleTokenScore}) DESC,
    ts_rank("searchVector", search_query.value, 1) DESC,
    "isSelf" DESC,
    "createdAt" DESC,
    id ASC
  `;

  // 为 AI 限制最大只召回前 6 条，既能保证资源相关度，又能完美控制大模型的 Token 上限
  const limit = 6;
  dataParams.push(limit);
  const limitIndex = paramIndex++;

  const sql = `
    WITH search_query AS (
      SELECT ${searchQueryExpression} AS value
    )
    SELECT id, title, url, "createdAt"
    FROM "Source" CROSS JOIN search_query
    ${whereClause}
    ORDER BY ${orderClause}
    LIMIT $${limitIndex};
  `;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(sql, dataParams);

    // 4. 数据脱敏与字段极其精简（绝不暴露原始 url 防止 AI 读错）
    return result.rows.map((row) => {
      return {
        id: row.id,
        title: row.title,
        panType: getStorageTypeFriend(row.url),
        createdAt: row.createdAt,
      };
    });
  } catch (err) {
    console.error("AI 搜索内部数据库报错:", err);
    return [];
  } finally {
    if (client) client.release();
  }
}

/**
 * 专供大模型 Agent 调用的音乐数据检索函数
 * 移除了前端专用的分页、总数统计、复杂字段，只召回 Top 6 最匹配的纯净音乐结果
 */
async function searchMusicForAi(keyword: string) {
  const term = keyword?.trim() || "";
  if (!term) return [];

  // 1. 获取结巴分词的 tokens 数组
  const tokens = cutForSearch(term);
  if (tokens.length === 0) return [];

  // 2. 构建符合 to_tsquery 语法的查询文本
  // AI 搜索默认走非 exact：主词 AND (其余词 OR …)，括号由 to_tsquery 真实保留
  const formattedWebQuery = buildTsQuery(tokens, true);

  // 限制最大只召回前 6 条，既能保证资源相关度，又能完美控制大模型的 Token 上限
  const limit = 6;

  try {
    // 3. 执行 Prisma 原生 SQL 查询，完美保持参数化安全机制
    const musics = await prisma.$queryRaw<any[]>`
      SELECT id, title, artist, album
      FROM "Music"
      WHERE status = 1
        AND "searchVector" @@ to_tsquery('simple', ${formattedWebQuery})
      ORDER BY 
        ts_rank_cd("searchVector", to_tsquery('simple', ${formattedWebQuery}), 1) DESC, 
        "viewCount" DESC, 
        "createdAt" DESC
      LIMIT ${limit};
    `;

    // 4. 返回精简且干净的结构给大模型
    return musics.map((music) => ({
      id: music.id,
      title: music.title || "",
      artist: music.artist || "",
      album: music.album || "",
    }));
  } catch (err) {
    console.error("AI 音乐搜索内部数据库报错:", err);
    return [];
  }
}

// #####################################
// #####################################
// #####################################
// #####################################
// #####################################

const SYSTEM_PROMPT = `
# Role
你是一个极其专业、懂音乐、资源广博且温和风趣的“音乐与网盘资源智能导航专家”。你的目标是深度理解用户的真实意图，通过调用底层的“音乐库搜索工具”或“网盘资源搜索工具”为用户找到他们想听、想下载或寻找的内容。

# Task Alignment & Routing Rules (核心工具选择逻辑)
请根据用户的输入，自主决定调用哪一个或同时调用哪几个工具：
- 【情况 A：只想听歌 / 寻找歌曲代表作】当用户表达“想听歌”、“推荐几首xx的歌”、“有哪些热门歌曲”或描述某种音乐风格时，你必须调用 [search_music] 工具。
- 【情况 B：寻找或下载影视、动漫、软件、图书资源】当用户提到“网盘”、“下载”、“资源”，或者【让推荐/寻找影视剧、搞笑动漫、科幻电影、电子书、软件】时，你必须调用 [search_sources] 工具。
- 【情况 C：既想听又想找资源】当用户同时包含上述两种意图时，你应当【同时】调用这两个工具。
- 【情况 D：开放网络事实 / 资讯 / 站外信息】需要从网络上搜索信息时，调用 [search_web] 工具。典型：热门音乐、热门电视剧、新闻资讯、人物百科、事件背景、软件教程、天气、旅游攻略、歌词赏析、专辑发行背景等**你需要引用站外事实才能答准**的问题。

# Tool Parameter Extraction Rules (参数提取规则)
当调用 [search_sources] 时，请仔细分析用户是否指定了特定的网盘平台：
- 如果提到了“夸克”，参数 panType 必须传 "quark"
- 如果提到了“百度”或“度盘”，参数 panType 必须传 "baidu"
- 如果提到了“迅雷”，参数 panType 必须传 "xunlei"
- 如果提到了“UC”，参数 panType 必须传 "uc"
- 如果提到了“光鸭云盘”，参数 panType 必须传 "guangya"
- 如果提到了“移动云盘”，参数 panType 必须传 "139"
- 如果用户【没有提及】任何具体的网盘名称，panType 必须默认传 "all"

当调用 [search_web] 时：
- query 必须是**具体的检索词**，不要把整句提问原样塞进去；一个主题最多拆成 2-3 个独立 query 分别检索。
- numResults 按问题复杂度给 3~8，简单事实类给 3 即可。

# Capability & Workflow (严格执行)
1. 意图发散与推理（极其重要）：当用户寻找“代表作 / 推荐某一类型作品 / 资源合集”时，你需要在脑海中广博地拆解出最具代表性的 4-6 个具体作品名称。
   - 如果是搜音乐，必须将不同的歌曲（格式：'歌手名 歌名'）全部塞进 [search_music] 的 keywords 数组中。
   - 如果是找/推荐动漫、电影等资源，必须将你脑海中筛选出的具体作品名称（如：'银魂', '男子高中生的日常', '齐木楠雄的灾难'）塞进 [search_sources] 的 keywords 数组中，绝对不能塞‘搞笑’、‘动漫’这种宽泛的形容词！
2. 文本规范：在第二次输出回答时，你在正文中【绝对不要】输出任何带有 URL、ID、括号或特殊前缀的链接格式。你只需要用最自然、人性化的纯文本向用户介绍你找到了哪些经典作品。
3. 链接由系统生成：站内曲目/资源的链接你不需要关心怎么写，系统会在你的回答末尾自动附加绝对准确的直达卡片。
4. 网页搜索结果的使用：[search_web] 返回的条目带 title / text / publishedDate。回答时**必须忠于返回的 text 内容**，不得编造未出现在结果中的事实；多个来源冲突时如实说明存在不同说法。正文里可以用纯文本提到来源站点名称，但不要输出 URL。`;

const SEARCH_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_music",
      description:
        "当用户想要寻找歌曲、特定专辑、歌手代表作，或通过描述推理出具体曲名时调用此工具。支持传入一首或多首歌曲的关键词列表。",
      parameters: {
        type: "object",
        properties: {
          keywords: {
            type: "array",
            items: { type: "string" },
            description:
              "精准检索词数组。格式建议为 ['歌手名 歌曲名']（例如：['周杰伦 晴天']）。",
          },
        },
        required: ["keywords"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_sources",
      description:
        "当用户寻找、或者要求【推荐】动漫、电影、电视剧、综艺、软件、电子书或打包资源时调用此工具。支持传入多个具体的作品名称作为关键词，并支持筛选特定的网盘渠道。",
      parameters: {
        type: "object",
        properties: {
          keywords: {
            type: "array",
            items: { type: "string" },
            description:
              "具体的动漫名称、电影名称或资源关键词数组。请给出具体的作品名，例如：['银魂', '男子高中生的日常', '游戏三人娘']。",
          },
          // 💡 核心改动：加入 panType 枚举字段参数
          panType: {
            type: "string",
            enum: ["all", "quark", "baidu", "xunlei", "uc", "guangya", "139"],
            description:
              "网盘资源类型筛选。用户指定了某个网盘则传对应值，未指定则必须传 'all'。",
          },
        },
        required: ["keywords", "panType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_web",
      description:
        "开放网络检索（Exa）。当需要站外事实才能回答时调用：新闻资讯、人物/作品背景、事件经过、教程步骤、榜单评价等。返回条目的标题、摘要与发布时间。",
      parameters: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            description:
              "具体检索词数组，1~3 个为宜。例如：['周杰伦 七里香 发行时间', '七里香 专辑 评价']。",
          },
          numResults: {
            type: "number",
            description: "每个检索词的召回条数，3~8，默认 5。",
          },
        },
        required: ["queries"],
      },
    },
  },
];

/** SSE 事件协议（data: 行的 JSON）：
 *  - { queue: { position } }   排队进度（position=0 表示轮到本人）
 *  - { reasoning: "..." }      模型思考过程增量（reasoning_content，无则为空）
 *  - { tool: { index, name, keywords, panType } }  工具调用开始
 *  - { toolDone: { index, count } }                 工具调用结束，count 为召回条数
 *  - { chunk: "..." }          最终回答增量（兼容旧前端）
 *  - { error: "..." }          出错
 *  - [DONE]                    流结束
 *
 * 工具三件套：search_music（站内曲库）/ search_sources（站内网盘）/ search_web（Exa 开放网络）。
 */
interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/** 网页搜索结果（注入 tool 消息前做字段精简，控制上下文体积） */
interface WebSearchItem {
  title: string;
  url: string;
  text: string;
  publishedDate: string;
}

/**
 * 解析请求体，兼容两种协议：
 *  - 新版多轮：{ messages: [{ role, content }, ...] }（最后一条必须是 user）
 *  - 旧版单轮：{ message: "..." }
 */
function parseConversation(body: any): HistoryMessage[] {
  const rawMessages = Array.isArray(body?.messages) ? body.messages : null;

  if (rawMessages) {
    const history = rawMessages
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim(),
      )
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        // assistant 历史里尾部附带的资源链接列表很长，截断保留语义、砍掉 token
        content:
          m.role === "assistant"
            ? m.content.slice(0, MAX_HISTORY_ASSISTANT_LENGTH)
            : m.content.slice(0, MAX_MESSAGE_LENGTH),
      }))
      .slice(-MAX_HISTORY_MESSAGES);

    if (history.length === 0 || history[history.length - 1].role !== "user") {
      throw createError({ statusCode: 400, message: "对话格式不正确" });
    }
    return history;
  }

  // 旧版单轮协议（兼容缓存里的旧前端）
  const userMessage = body?.message;
  if (!userMessage || typeof userMessage !== "string") {
    throw createError({ statusCode: 400, message: "缺少 messages 参数" });
  }
  return [{ role: "user", content: userMessage }];
}

export default defineEventHandler(async (event) => {
  await assertBotDefense(event, "/api/ai-search");
  const body = await readBody(event);

  const history = parseConversation(body);
  const latestUserMessage = history[history.length - 1]!.content;

  // 🔒 长度上限：仅有下限没有上限时，单次请求可送入超大 prompt，
  // 直接放大模型调用费用（限流挡不住"一次超大请求"）。
  if (latestUserMessage.trim().length > MAX_MESSAGE_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `搜索内容过长，最多 ${MAX_MESSAGE_LENGTH} 个字符`,
    });
  }

  if (latestUserMessage.trim().length < MIN_MESSAGE_LENGTH) {
    throw createError({
      statusCode: 400,
      message: `搜索内容过短，最少 ${MIN_MESSAGE_LENGTH} 个字符`,
    });
  }

  // 读取 AI 搜索配置
  const aiConfig = await getAiSearchConfig();
  if (!aiConfig.enabled) {
    throw createError({ statusCode: 403, message: "AI 搜索功能未开启" });
  }
  if (!aiConfig.baseURL || !aiConfig.apiKey || !aiConfig.model) {
    throw createError({ statusCode: 500, message: "AI 搜索配置不完整" });
  }

  // 按 baseURL + apiKey 复用客户端（内置 timeout / maxRetries），不要每请求 new
  const openai = getAiChatClient({
    baseURL: aiConfig.baseURL,
    apiKey: aiConfig.apiKey,
  });
  const model = aiConfig.model;

  setHeaders(event, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const currentMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      {
        role: "system",
        content:
          SYSTEM_PROMPT + `\n当前日期是${new Date().toLocaleDateString()}`,
      },
      // 多轮对话：完整历史 + 最新一条 user（parseConversation 已保证末条为 user）
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

  const stream = new Readable({
    read() {},
  });
  const requestId = Math.random().toString(36).substring(7);
  /** SSE 推送助手：统一 data: 行格式 */
  const push = (payload: unknown) =>
    stream.push(`data: ${JSON.stringify(payload)}\n\n`);

  (async () => {
    let releaseLock: (() => void) | null = null;
    let hasWaited = false; // 💡 引入标记位：默认没有排过队

    try {
      // 核心：卡进排队机
      releaseLock = await aiRequestQueue.enter(requestId, (position) => {
        hasWaited = true; // 🌟 只要触发了这个回调，说明真的在排队了，标记置为 true

        // 实时给前端推送排队进度
        push({ queue: { position } });
      });

      // 🔑 轮到该用户了：判断是否排过队
      if (hasWaited) {
        // 只有排过队的人，才需要通知前端清除排队提示
        push({ queue: { position: 0 } });
      }

      // 1. 首次调用大模型（流式），等待工具决策。
      //    流式的意义：思考过程（reasoning_content）可以实时推给前端展示，
      //    而不是等整个决策结束才黑屏。
      const firstStream = await openai.chat.completions.create({
        model,
        messages: currentMessages,
        tools: SEARCH_TOOLS,
        stream: true,
      });

      let contentBuf = "";
      /** index → 累积的 tool_call（流式下 tool_calls 按 index 分片到达） */
      const toolCallsMap = new Map<
        number,
        { id: string; name: string; args: string }
      >();

      for await (const chunk of firstStream) {
        const delta: any = chunk.choices[0]?.delta;
        if (!delta) continue;

        // 思考过程：DeepSeek/Qwen/GLM 等 OpenAI 兼容端点统一走 reasoning_content，
        // 个别端点用 reasoning，两个都兜住
        const reasoning =
          delta.reasoning_content ??
          (typeof delta.reasoning === "string" ? delta.reasoning : "");
        if (reasoning) {
          push({ reasoning });
        }

        // 纯聊天（不触发工具）时的正文，边收边推
        if (delta.content) {
          contentBuf += delta.content;
          push({ chunk: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = toolCallsMap.get(idx) || { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            toolCallsMap.set(idx, cur);
          }
        }
      }

      const toolCalls = [...toolCallsMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([index, tc]) => ({
          index,
          id: tc.id || `call_${requestId}_${index}`,
          name: tc.name,
          arguments: tc.args,
        }))
        .filter((tc) => tc.name);

      let finalMessages = [...currentMessages];
      let finalMusicList: Array<{ id: string; title: string; artist: string }> =
        [];
      let finalSourceList: Array<{ id: string; title: string; type?: string }> =
        [];
      /** 网页搜索命中条数：>0 时正文末尾追加来源附注 */
      let webHitCount = 0;

      // 2. 触发工具调用逻辑
      if (toolCalls.length > 0) {
        // 先把工具调用意图推给前端（思考过程的一部分）
        toolCalls.forEach((tc) => {
          let args: any = {};
          try {
            args = JSON.parse(tc.arguments || "{}");
          } catch {
            args = {};
          }
          push({
            tool: {
              index: tc.index,
              name: tc.name,
              keywords: Array.isArray(args.keywords)
                ? args.keywords
                : args.keyword
                  ? [args.keyword]
                  : [],
              queries: Array.isArray(args.queries)
                ? args.queries
                : args.query
                  ? [args.query]
                  : [],
              panType: args.panType,
            },
          });
        });

        const toolOutputs = await Promise.all(
          toolCalls.map(async (toolCall) => {
            let args: any = {};
            try {
              args = JSON.parse(toolCall.arguments || "{}");
            } catch {
              args = {};
            }
            const keywords: string[] =
              args.keywords || (args.keyword ? [args.keyword] : []);

            // 🎵 路由分支 A：音乐检索
            if (toolCall.name === "search_music") {
              const searchPromises = keywords.map((keyword) =>
                searchMusicForAi(keyword),
              );
              const resultsArray = await Promise.all(searchPromises);

              // 本次工具调用自己的结果（按 id 去重，每个关键词取 Top1）
              const callItems: typeof finalMusicList = [];
              const seenIds = new Set<string>();
              for (const list of resultsArray) {
                const coreItems = list.slice(0, 1);
                for (const item of coreItems) {
                  const id = String(item.id);
                  if (!seenIds.has(id)) {
                    seenIds.add(id);
                    callItems.push({
                      id,
                      title: item.title,
                      artist: item.artist || "未知歌手",
                    });
                  }
                }
              }

              // 合并进全局列表（跨工具调用去重，控制尾部卡片总数）
              for (const item of callItems) {
                if (
                  finalMusicList.length < 6 &&
                  !finalMusicList.some((m) => m.id === item.id)
                ) {
                  finalMusicList.push(item);
                }
              }

              push({
                toolDone: { index: toolCall.index, count: callItems.length },
              });

              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(callItems),
              };
            }

            // 💾 路由分支 B：网盘资源检索
            if (toolCall.name === "search_sources") {
              // 💡 提取大模型识别出的 panType，兜底为 "all"
              const panType:
                | "all"
                | "quark"
                | "baidu"
                | "xunlei"
                | "uc"
                | "guangya"
                | "139" = args.panType || "all";

              // 💡 将 panType 传入底层的搜索函数中
              const searchPromises = keywords.map((keyword) =>
                searchSourcesForAi(keyword, panType),
              );
              const resultsArray = await Promise.all(searchPromises);

              const callItems: typeof finalSourceList = [];
              const seenIds = new Set<string>();
              for (const list of resultsArray) {
                const coreItems = list.slice(0, 2);
                for (const item of coreItems) {
                  const id = String(item.id);
                  if (!seenIds.has(id)) {
                    seenIds.add(id);
                    callItems.push({
                      id,
                      title: item.title,
                      type: item.panType || "网盘", // 顺便把具体的网盘字段放到 card 里展示
                    });
                  }
                }
              }

              for (const item of callItems) {
                if (
                  finalSourceList.length < 6 &&
                  !finalSourceList.some((s) => s.id === item.id)
                ) {
                  finalSourceList.push(item);
                }
              }

              push({
                toolDone: { index: toolCall.index, count: callItems.length },
              });

              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(callItems),
              };
            }

            // 🌐 路由分支 C：开放网络检索（Exa）
            if (toolCall.name === "search_web") {
              const queries: string[] = Array.isArray(args.queries)
                ? args.queries.filter(
                    (q: unknown) => typeof q === "string" && q.trim(),
                  )
                : args.query
                  ? [String(args.query)]
                  : [];
              const numResults = Number(args.numResults) || 5;

              // 每个 query 并发检索，失败的 query 不拖垮整次调用
              const resultsArray = await Promise.all(
                queries.map((q) =>
                  searchExaWeb(q, numResults).catch(
                    () => [] as WebSearchItem[],
                  ),
                ),
              );

              // 跨 query 按 url 去重，整体上限 12 条，控制注入上下文的体积
              const seenUrls = new Set<string>();
              const items: WebSearchItem[] = [];
              for (const list of resultsArray) {
                for (const item of list) {
                  if (seenUrls.has(item.url)) continue;
                  seenUrls.add(item.url);
                  if (items.length >= 12) break;
                  items.push(item);
                }
              }

              webHitCount += items.length;
              push({
                toolDone: { index: toolCall.index, count: items.length },
              });

              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(items),
              };
            }

            return null;
          }),
        );

        const validToolOutputs = toolOutputs.filter(
          (output): output is Exclude<typeof output, null> => output !== null,
        );

        // 把 assistant 的 tool_calls 决策按 OpenAI 协议原样拼回上下文
        finalMessages.push({
          role: "assistant",
          content: contentBuf || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
        finalMessages.push(...validToolOutputs);
      } else {
        // 纯聊天：正文已在上面边收边推，直接收尾
        if (!contentBuf) {
          throw createError({ statusCode: 500, message: "AI 模型返回为空" });
        }
        stream.push("data: [DONE]\n\n");
        stream.push(null);
        return;
      }

      // 3. 第二次调用大模型：流式输出正文
      const targetStream = await openai.chat.completions.create({
        model,
        messages: finalMessages,
        stream: true,
      });

      for await (const chunk of targetStream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          push({ chunk: text });
        }
      }

      // 🌟 4. 尾部追加逻辑
      let appendMarkdown = "";

      // 追加音乐列表
      if (finalMusicList.length > 0) {
        appendMarkdown += "\n\n---\n\n### 🎵 站内网盘资源直达\n";
        finalMusicList.forEach((music, index) => {
          appendMarkdown += `${index + 1}. [${music.title} - ${music.artist}](${siteHost}/music/${music.id}){target="_blank"}\n`;
        });
      }

      // 追加网盘资源列表
      if (finalSourceList.length > 0) {
        appendMarkdown += "\n\n---\n\n### 💾 站内网盘资源直达\n";
        finalSourceList.forEach((source, index) => {
          // 💡 核心修复：洗白标题，把标题内自带的 [ 和 ] 替换为安全的中文字符，防止破坏 Markdown 语法
          const safeTitle = source.title
            .replace(/\[/g, "【")
            .replace(/\]/g, "】")
            .replace(/\(/g, "（")
            .replace(/\)/g, "）");

          appendMarkdown += `${index + 1}. [【${source.type}】${safeTitle}](${siteHost}/source/${source.id}){target="_blank"}\n`;
        });
      }

      // 网页搜索命中时追加来源附注（站内直达卡片在前，来源附注殿后）
      if (webHitCount > 0) {
        appendMarkdown += `\n\n---\n\n> 🌐 本回答含网络检索结果，共参考 ${webHitCount} 条网页来源\n`;
      }

      if (appendMarkdown) {
        push({ chunk: appendMarkdown });
      }

      stream.push("data: [DONE]\n\n");
      stream.push(null);
    } catch (error: any) {
      console.error("流式生成发生错误:", error);
      push({ error: error.message || "内部错误" });
      stream.push(null);
    } finally {
      // 4. 无论成功还是失败，【必须】在最右释放锁，让后面的人进来！
      if (releaseLock) {
        releaseLock();
      }
    }
  })();

  return sendStream(event, stream);
});
