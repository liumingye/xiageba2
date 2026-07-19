import { OpenAI } from "openai";
import { Pool } from "pg";
import { prisma } from "#server/lib/prisma";
import "dotenv/config";
import {
  cutForSearch,
  prioritizeSearchTokens,
  buildSearchWebQuery,
} from "#server/utils/jieba";
import { PAN_HOST_MAP, PanFilter } from "#server/api/source/search.get";
import { Readable } from "stream";
import { aiRequestQueue } from "#server/utils/queue"; // 引入刚才写的排队机
import { getAiSearchConfig } from "#server/api/admin/config/ai-search";
import { getStorageTypeFriend } from "#shared/utils";

const siteHost = process.env.SITE_HOST || "";

// 保持同一个连接池，或者引用你全局的 pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * 专供大模型 Agent 调用的底层数据库检索函数
 * 剃除了分页、时间筛选、目录树、复杂打分等无意义字段，只召回 Top 6 最匹配的纯净结果
 */
async function searchSourcesForAi(keyword: string, panType: PanFilter = "all") {
  const term = keyword?.trim() || "";
  if (!term) return [];

  // 1. 结巴分词与核心词提取
  const keywordTokens = prioritizeSearchTokens(cutForSearch(term));
  if (keywordTokens.length === 0) return [];

  const keywordWebQuery = buildSearchWebQuery(keywordTokens, false);
  const tokens = [...keywordTokens];

  // 2. 动态构造 SQL 条件与参数
  const baseParams: any[] = [];
  let paramIndex = 1;
  const conditions: string[] = [];

  // 网盘渠道过滤
  const panFilter = panType in PAN_HOST_MAP ? panType : "all";
  const panHosts = PAN_HOST_MAP[panFilter];
  if (panHosts.length > 0) {
    const likeConditions = panHosts.map((host) => {
      baseParams.push(`http%://${host}/%`);
      return `url LIKE $${paramIndex++}`;
    });
    conditions.push(`(${likeConditions.join(" OR ")})`);
  }

  // 核心文本/向量检索式
  const queryParamIndex = paramIndex++;
  baseParams.push(keywordWebQuery);
  const searchQueryExpression = `websearch_to_tsquery('simple', $${queryParamIndex})`;
  conditions.push(`"searchVector" @@ search_query.value`);

  // 拼接完整的 WHERE
  const whereClause = `WHERE "isTemp" = false AND "status" = 1 AND ${conditions.join(" AND ")}`;

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

  // 2. 构建符合 websearch_to_tsquery 语法的查询文本
  // AI 搜索建议默认走非 exact（OR 模糊匹配），大模型提炼出来的核心词容错率更高
  const formattedWebQuery = tokens.join(" OR ");

  // 限制最大只召回前 6 条，既能保证资源相关度，又能完美控制大模型的 Token 上限
  const limit = 6;

  try {
    // 3. 执行 Prisma 原生 SQL 查询，完美保持参数化安全机制
    const musics = await prisma.$queryRaw<any[]>`
      SELECT id, title, artist, album
      FROM "Music"
      WHERE "searchVector" @@ websearch_to_tsquery('simple', ${formattedWebQuery}) AND "downloads" LIKE '[{"quality": "夸克%'
      ORDER BY 
        ts_rank_cd("searchVector", websearch_to_tsquery('simple', ${formattedWebQuery}), 1) DESC, 
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
请根据用户的输入，自主决定调用哪一个或同时调用哪两个工具：
- 【情况 A：只想听歌 / 寻找歌曲代表作】当用户表达“想听歌”、“推荐几首xx的歌”、“有哪些热门歌曲”或描述某种音乐风格时，你必须调用 [search_music] 工具。
- 【情况 B：寻找或下载影视、动漫、软件、图书资源】当用户提到“网盘”、“下载”、“资源”，或者【让推荐/寻找影视剧、搞笑动漫、科幻电影、电子书、软件】时，你必须调用 [search_sources] 工具。
- 【情况 C：既想听又想找资源】当用户同时包含上述两种意图时，你应当【同时】调用这两个工具。

# Tool Parameter Extraction Rules (参数提取规则)
当调用 [search_sources] 时，请仔细分析用户是否指定了特定的网盘平台：
- 如果提到了“夸克”，参数 panType 必须传 "quark"
- 如果提到了“百度”或“度盘”，参数 panType 必须传 "baidu"
- 如果提到了“迅雷”，参数 panType 必须传 "xunlei"
- 如果提到了“UC”，参数 panType 必须传 "uc"
- 如果用户【没有提及】任何具体的网盘名称，panType 必须默认传 "all"

# Capability & Workflow (严格执行)
1. 意图发散与推理（极其重要）：当用户寻找“代表作 / 推荐某一类型作品 / 资源合集”时，你需要在脑海中广博地拆解出最具代表性的 4-6 个具体作品名称。
   - 如果是搜音乐，必须将不同的歌曲（格式：'歌手名 歌名'）全部塞进 [search_music] 的 keywords 数组中。
   - 如果是找/推荐动漫、电影等资源，必须将你脑海中筛选出的具体作品名称（如：'银魂', '男子高中生的日常', '齐木楠雄的灾难'）塞进 [search_sources] 的 keywords 数组中，绝对不能塞‘搞笑’、‘动漫’这种宽泛的形容词！
2. 文本规范：在第二次输出回答时，你在正文中【绝对不要】输出任何带有 URL、ID、括号或特殊前缀的链接格式。你只需要用最自然、人性化的纯文本向用户介绍你找到了哪些经典作品。
3. 链接由系统生成：你不需要关心链接怎么写，系统会在你的回答末尾自动附加绝对准确的直达卡片。
`;

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
            enum: ["all", "quark", "baidu", "xunlei", "uc"],
            description:
              "网盘资源类型筛选。用户指定了某个网盘则传对应值，未指定则必须传 'all'。",
          },
        },
        required: ["keywords", "panType"],
      },
    },
  },
];

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const userMessage = body?.message;

  if (!userMessage || typeof userMessage !== "string") {
    throw createError({ statusCode: 400, message: "缺少 message 参数" });
  }

  // 读取 AI 搜索配置
  const aiConfig = await getAiSearchConfig();
  if (!aiConfig.enabled) {
    throw createError({ statusCode: 403, message: "AI 搜索功能未开启" });
  }
  if (!aiConfig.baseURL || !aiConfig.apiKey || !aiConfig.model) {
    throw createError({ statusCode: 500, message: "AI 搜索配置不完整" });
  }

  const openai = new OpenAI({
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
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];

  const stream = new Readable({
    read() {},
  });
  const requestId = Math.random().toString(36).substring(7);

  (async () => {
    let releaseLock: (() => void) | null = null;
    let hasWaited = false; // 💡 引入标记位：默认没有排过队

    try {
      // 核心：卡进排队机
      releaseLock = await aiRequestQueue.enter(requestId, (position) => {
        hasWaited = true; // 🌟 只要触发了这个回调，说明真的在排队了，标记置为 true

        // 实时给前端推送排队进度
        stream.push(
          `data: ${JSON.stringify({
            chunk: `\r⚠️ 当前服务器爆满，正在排队中（您当前排在第 **${position}** 位），请稍等...`,
          })}\n\n`,
        );
      });

      // 🔑 轮到该用户了：判断是否排过队
      if (hasWaited) {
        // 只有排过队的人，才需要用 \r 清除刚刚的排队字样
        stream.push(
          `data: ${JSON.stringify({ chunk: `\n🚀 轮到您了！正在为您思考中...\n\n` })}\n\n`,
        );
      }

      // 1. 首次调用大模型，等待工具决策
      const response = await openai.chat.completions.create({
        model,
        messages: currentMessages,
        tools: SEARCH_TOOLS,
      });

      const message = response.choices[0]?.message;

      if (!message) {
        throw createError({ statusCode: 500, message: "AI 模型返回为空" });
      }

      const toolCalls = message.tool_calls as
        | {
            id: string;
            function: { name: string; arguments: string };
          }[]
        | undefined;

      let finalMessages = [...currentMessages];

      let finalMusicList: Array<{ id: string; title: string; artist: string }> =
        [];
      let finalSourceList: Array<{ id: string; title: string; type?: string }> =
        [];

      // 2. 触发工具调用逻辑
      if (toolCalls && toolCalls.length > 0) {
        const toolOutputs = await Promise.all(
          toolCalls.map(async (toolCall) => {
            const args = JSON.parse(toolCall.function.arguments);
            const keywords: string[] =
              args.keywords || (args.keyword ? [args.keyword] : []);

            // 🎵 路由分支 A：音乐检索
            if (toolCall.function.name === "search_music") {
              const searchPromises = keywords.map((keyword) =>
                searchMusicForAi(keyword),
              );
              const resultsArray = await Promise.all(searchPromises);

              const seenIds = new Set();
              for (const list of resultsArray) {
                const coreItems = list.slice(0, 1);
                for (const item of coreItems) {
                  if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    finalMusicList.push({
                      id: String(item.id),
                      title: item.title,
                      artist: item.artist || "未知歌手",
                    });
                  }
                }
              }
              if (finalMusicList.length > 6)
                finalMusicList = finalMusicList.slice(0, 6);

              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(finalMusicList),
              };
            }

            // 💾 路由分支 B：网盘资源检索
            if (toolCall.function.name === "search_sources") {
              // 💡 提取大模型识别出的 panType，兜底为 "all"
              const panType: "all" | "quark" | "baidu" | "xunlei" | "uc" =
                args.panType || "all";

              // 💡 将 panType 传入底层的搜索函数中
              const searchPromises = keywords.map((keyword) =>
                searchSourcesForAi(keyword, panType),
              );
              const resultsArray = await Promise.all(searchPromises);

              const seenIds = new Set();
              for (const list of resultsArray) {
                const coreItems = list.slice(0, 2);
                for (const item of coreItems) {
                  if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    finalSourceList.push({
                      id: String(item.id),
                      title: item.title,
                      type: item.panType || "网盘", // 顺便把具体的网盘字段放到 card 里展示
                    });
                  }
                }
              }
              if (finalSourceList.length > 6)
                finalSourceList = finalSourceList.slice(0, 6);

              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(finalSourceList),
              };
            }

            return null;
          }),
        );

        const validToolOutputs = toolOutputs.filter(
          (output): output is Exclude<typeof output, null> => output !== null,
        );

        finalMessages.push(message);
        finalMessages.push(...validToolOutputs);
      } else {
        // 纯聊天
        finalMessages.push(message);
        if (message.content) {
          stream.push(
            `data: ${JSON.stringify({ chunk: message.content })}\n\n`,
          );
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
          stream.push(`data: ${JSON.stringify({ chunk: text })}\n\n`);
        }
      }

      // 🌟 4. 尾部追加逻辑
      let appendMarkdown = "";

      // 追加音乐列表
      if (finalMusicList.length > 0) {
        appendMarkdown += "\n\n---\n\n### 🎵 站内网盘资源直达\n";
        finalMusicList.forEach((music, index) => {
          appendMarkdown += `${index + 1}. [${music.title} - ${music.artist}](${siteHost}/music/${music.id})\n`;
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

          appendMarkdown += `${index + 1}. [【${source.type}】${safeTitle}](${siteHost}/source/${source.id})\n`;
        });
      }

      if (appendMarkdown) {
        stream.push(`data: ${JSON.stringify({ chunk: appendMarkdown })}\n\n`);
      }

      stream.push("data: [DONE]\n\n");
      stream.push(null);
    } catch (error: any) {
      console.error("流式生成发生错误:", error);
      stream.push(
        `data: ${JSON.stringify({ error: error.message || "内部错误" })}\n\n`,
      );
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
