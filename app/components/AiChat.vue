<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import { Sparkles, ExternalLink } from "@lucide/vue";
import { safeMarkdownPlugins } from "~/utils/comark-safe";

// ---------- 数据结构（与 Nuxt UI UChatMessages 期望的 UIMessage 形状对齐） ----------
interface TextPart {
  type: "text";
  text: string;
}
interface ReasoningPart {
  type: "reasoning";
  text: string;
  streaming: boolean;
}
interface ToolPart {
  type: "tool";
  index: number;
  label: string;
  detail: string;
  state: "running" | "done";
  count: number;
}
type ChatPart = TextPart | ReasoningPart | ToolPart;

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  parts: ChatPart[];
}

/** 与 @ai-sdk/vue 的 status 对齐：驱动 UChatMessages 指示器与 UChatPromptSubmit 按钮态 */
type ChatStatus = "ready" | "submitted" | "streaming" | "error";

const props = defineProps<{
  initialQuery?: string;
}>();

const TOOL_LABELS: Record<string, string> = {
  search_music: "检索音乐库",
  search_sources: "检索网盘资源",
};
const PAN_LABELS: Record<string, string> = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  xunlei: "迅雷云盘",
  uc: "UC 网盘",
};

const suggestions = [
  { icon: "i-lucide-music", text: "我想听周杰伦的歌" },
  { icon: "i-lucide-moon", text: "推荐几首适合深夜听的歌" },
  { icon: "i-lucide-film", text: "找几部搞笑动漫的资源" },
  { icon: "i-lucide-search", text: "《银魂》全集百度网盘" },
];

const messages = ref<UiMessage[]>([]);
const input = ref("");
const status = ref<ChatStatus>("ready");
const chatError = ref("");
/** 排队机等待提示（服务端推送的实时进度） */
const queueText = ref("");
const streamingId = ref<string | null>(null);
const inIframe = ref(false);

let abortController: AbortController | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let idSeq = 0;
const nextId = () => `m_${Date.now().toString(36)}_${idSeq++}`;

const toast = useToast();

const showWelcome = computed(
  () => messages.value.length === 0 && status.value === "ready",
);

const textOf = (message: UiMessage): string =>
  message.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("");

/** UChatMessages 的插槽属性是 AI SDK 的 UIMessage 类型，这里转成自己的结构 */
const partsOf = (message: UiMessage): ChatPart[] => message.parts;

const isStreaming = (message: UiMessage): boolean =>
  streamingId.value === message.id;

const describeTool = (tool: {
  name: string;
  keywords?: string[];
  panType?: string;
}): string => {
  const keywords = (tool.keywords || []).filter(Boolean);
  const pan =
    tool.name === "search_sources" && tool.panType && tool.panType !== "all"
      ? `平台：${PAN_LABELS[tool.panType] || tool.panType}`
      : "";
  const kw = keywords.length ? `关键词：${keywords.join("、")}` : "";
  return [pan, kw].filter(Boolean).join(" · ");
};

// ---------- 流式增量写入 ----------
const finalizeReasoning = (msg: UiMessage) => {
  for (const part of msg.parts) {
    if (part.type === "reasoning") part.streaming = false;
  }
};

const appendReasoning = (msg: UiMessage, text: string) => {
  const last = msg.parts[msg.parts.length - 1];
  if (last && last.type === "reasoning") {
    last.text += text;
  } else {
    msg.parts.push({ type: "reasoning", text, streaming: true });
  }
};

const appendText = (msg: UiMessage, text: string) => {
  // 正文一开始输出，思考过程即告一段落（折叠块自动收起）
  finalizeReasoning(msg);
  const last = msg.parts[msg.parts.length - 1];
  if (last && last.type === "text") {
    last.text += text;
  } else {
    msg.parts.push({ type: "text", text });
  }
};

const appendTool = (msg: UiMessage, tool: any) => {
  finalizeReasoning(msg);
  msg.parts.push({
    type: "tool",
    index: typeof tool.index === "number" ? tool.index : 0,
    label: TOOL_LABELS[tool.name] || tool.name || "调用工具",
    detail: describeTool(tool),
    state: "running",
    count: 0,
  });
};

const finishTool = (msg: UiMessage, done: any) => {
  const target = msg.parts.find(
    (part): part is ToolPart =>
      part.type === "tool" &&
      part.index === done.index &&
      part.state === "running",
  );
  if (target) {
    target.state = "done";
    target.count = done.count || 0;
  }
};

const removeMessage = (msg: UiMessage) => {
  const idx = messages.value.indexOf(msg);
  if (idx > -1) messages.value.splice(idx, 1);
};

// ---------- 一轮对话 ----------
const runTurn = async () => {
  // 历史快照在占位消息入列前拍，占位消息永远不会进上下文
  const history = messages.value
    .map((m) => ({ role: m.role, content: textOf(m) }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-12);

  // ⚠️ 必须用 reactive() 包一层再入列，不能直接 push 普通对象：
  // ref 数组 push 普通对象后，闭包里持有的仍是原始引用，SSE 增量
  // （part.text += ...）不经过响应式代理，不会触发重渲染——只有
  // status 等其它 ref 变化时才顺带刷新一次，表现为「卡在第一个字，
  // 结束时整段蹦出来」。reactive 后所有读写都走代理，增量实时可见。
  const assistant = reactive<UiMessage>({
    id: nextId(),
    role: "assistant",
    parts: [],
  });
  messages.value.push(assistant);
  status.value = "submitted";
  chatError.value = "";
  queueText.value = "";
  streamingId.value = assistant.id;

  const controller = new AbortController();
  abortController = controller;

  try {
    const res = await fetch("/api/ai-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `请求失败 (${res.status})`);
    }
    if (!res.body) {
      throw new Error("浏览器不支持流式响应");
    }

    reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let started = false;
    const markStarted = () => {
      if (!started) {
        started = true;
        status.value = "streaming";
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        const line = evt.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let obj: any;
        try {
          obj = JSON.parse(payload);
        } catch {
          continue;
        }

        // 第一个有效事件到达才算进入流式态（此前展示等待指示器）
        markStarted();

        if (obj.error) throw new Error(obj.error);
        if (obj.queue) {
          queueText.value =
            obj.queue.position > 0
              ? `排队中，前方还有 ${obj.queue.position} 位…`
              : "";
        } else if (obj.reasoning) {
          appendReasoning(assistant, String(obj.reasoning));
        } else if (obj.tool) {
          appendTool(assistant, obj.tool);
        } else if (obj.toolDone) {
          finishTool(assistant, obj.toolDone);
        } else if (obj.chunk) {
          appendText(assistant, String(obj.chunk));
        }
      }
    }

    if (!textOf(assistant)) {
      // 有思考/工具过程但最终没有正文，视为空回复
      removeMessage(assistant);
      chatError.value = "AI 没有返回有效内容，请重试";
      status.value = "error";
    } else {
      status.value = "ready";
    }
  } catch (e: any) {
    const stillActive = abortController === controller;
    if (e?.name === "AbortError") {
      // 用户主动停止：有正文就保留部分结果，没有正文就整条撤掉
      if (stillActive && !textOf(assistant)) removeMessage(assistant);
      if (stillActive) status.value = "ready";
    } else {
      if (stillActive) {
        chatError.value = e?.message || "AI 搜索出错了，请稍后再试";
        if (assistant.parts.length === 0) removeMessage(assistant);
        status.value = "error";
      }
    }
  } finally {
    // 只清理属于本次请求的状态，避免旧请求的 finally 覆盖新请求
    if (abortController === controller) {
      finalizeReasoning(assistant);
      streamingId.value = null;
      queueText.value = "";
      abortController = null;
    }
    try {
      await reader?.cancel();
    } catch {
      // 流已结束/已中止，取消失败无需处理
    }
    reader = null;
  }
};

const send = (text?: string) => {
  const content = (text ?? "").trim();
  if (!content) return;
  if (status.value === "submitted" || status.value === "streaming") return;
  chatError.value = "";
  messages.value.push({
    id: nextId(),
    role: "user",
    parts: [{ type: "text", text: content }],
  });
  runTurn();
};

const onSubmit = () => {
  const text = input.value;
  if (!text.trim()) return;
  // 流式中不吞输入：等当前回合结束再发
  if (status.value === "submitted" || status.value === "streaming") return;
  input.value = "";
  send(text);
};

/** 停止当前生成（提交按钮在 submitted/streaming 态变为停止） */
const stop = () => {
  abortController?.abort();
};

/** 重新生成：输入框里改写了新内容就替换原问题重发，没有则原样重发 */
const regenerate = () => {
  if (status.value === "submitted" || status.value === "streaming") return;
  chatError.value = "";
  const edited = input.value.trim();
  const idx = messages.value.findLastIndex((m) => m.role === "user");
  if (idx === -1) {
    // 没有历史问题可重发时，输入框有内容就当作新问题发出
    if (edited) {
      input.value = "";
      send(edited);
    }
    return;
  }
  if (edited) {
    // 撤掉原问题及其之后的全部内容，用输入框的新内容替换重发
    messages.value.splice(idx);
    input.value = "";
    send(edited);
  } else {
    messages.value.splice(idx + 1);
    runTurn();
  }
};

/** 开一轮新对话 */
const resetChat = () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  messages.value = [];
  chatError.value = "";
  queueText.value = "";
  status.value = "ready";
  input.value = "";
};

const openInNewWindow = () => {
  window.open(window.location.href, "_blank", "noopener,noreferrer");
};

onMounted(() => {
  inIframe.value = !!(
    window.frameElement && window.frameElement.tagName === "IFRAME"
  );
  // 在 iframe 中不发起 AI 请求（用户看不到结果，浪费配额）
  if (props.initialQuery && !inIframe.value) {
    send(props.initialQuery);
  }
});

watch(
  () => props.initialQuery,
  (newQuery, oldQuery) => {
    if (!newQuery || newQuery === oldQuery || inIframe.value) return;
    // 同步终止上次请求并重置状态，避免 aiLoading 仍为 true 导致新请求被跳过
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    status.value = "ready";
    messages.value = [];
    chatError.value = "";
    queueText.value = "";
    input.value = "";
    send(newQuery);
  },
);

onUnmounted(() => {
  if (abortController) abortController.abort();
});
</script>

<template>
  <!-- iframe 内不可用：结果不可见，直接引导新窗口打开 -->
  <div
    v-if="inIframe"
    class="flex flex-col items-center justify-center h-[50vh] px-4 text-center"
  >
    <div
      class="size-16 bg-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4"
    >
      <Sparkles class="size-8 text-yellow-400" />
    </div>
    <h2 class="text-lg font-medium mb-2">不支持在 iframe 中使用 AI 搜索</h2>
    <p class="text-sm text-gray-500 max-w-md mx-auto mb-6">
      为了更好的体验，请在独立窗口中使用 AI 搜索功能。
    </p>
    <button
      type="button"
      @click="openInNewWindow"
      class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-inverted rounded-lg text-sm font-medium hover:opacity-90 transition"
    >
      <ExternalLink class="size-4" />
      在新窗口打开
    </button>
  </div>

  <div v-else class="flex flex-col h-[calc(100vh-var(--spacing)*33)]">
    <!-- 顶栏：标题 + 新对话 -->
    <div
      class="flex items-center justify-between gap-2 px-4 py-2 border-b border-default shrink-0"
    >
      <div class="flex items-center gap-2 text-sm font-medium">
        <Sparkles class="size-4 text-primary" />
        AI 智能搜索
      </div>
      <UButton
        v-if="messages.length"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-square-pen"
        @click="resetChat"
      >
        新对话
      </UButton>
    </div>

    <!-- 消息区：UChatMessages 自带自动滚动 / 回到底部按钮 / 等待指示器 -->
    <div class="flex-1 overflow-y-auto py-4">
      <!-- 空状态 -->
      <div v-if="showWelcome" class="max-w-3xl mx-auto text-center py-10">
        <div
          class="size-16 bg-primary-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4"
        >
          <Sparkles class="size-8 text-primary" />
        </div>
        <h2 class="text-lg font-medium mb-2">AI 智能搜索</h2>
        <p class="text-sm text-muted max-w-md mx-auto mb-6">
          告诉我你想找什么音乐或资源，描述模糊也没关系。支持多轮对话，可以接着上文继续问。
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <UButton
            v-for="s in suggestions"
            :key="s.text"
            size="sm"
            color="neutral"
            variant="subtle"
            :icon="s.icon"
            class="rounded-full"
            @click="send(s.text)"
          >
            {{ s.text }}
          </UButton>
        </div>
      </div>

      <UChatMessages
        class="max-w-3xl mx-auto"
        :messages="messages"
        :status="status"
        should-auto-scroll
        :user="{
          side: 'right',
          avatar: {
            icon: 'i-lucide-user',
          },
          variant: 'outline',
          ui: {
            leading: 'order-last',
          },
        }"
        :assistant="{
          avatar: {
            icon: 'i-lucide-bot',
          },
          variant: 'outline',
        }"
        :ui="{
          viewport: 'top-[80%]',
        }"
      >
        <template #content="{ message }">
          <!-- 用户消息：纯文本 -->
          <div
            v-if="message.role === 'user'"
            class="text-sm leading-relaxed whitespace-pre-wrap"
          >
            {{ textOf(message) }}
          </div>

          <!-- AI 消息：思考过程 → 工具调用 → 正文 -->
          <template v-else>
            <template v-for="(part, i) in partsOf(message)" :key="i">
              <!-- 思考过程（可折叠，流式中自动展开、结束后自动收起） -->
              <UChatReasoning
                v-if="part.type === 'reasoning'"
                :text="part.text"
                :streaming="part.streaming"
              >
                <Markdown
                  :value="part.text"
                  :streaming="part.streaming"
                  :plugins="safeMarkdownPlugins"
                  class="*:first:mt-0 *:last:mb-0"
                />
              </UChatReasoning>

              <!-- 工具调用（检索音乐库 / 网盘资源） -->
              <UChatTool
                v-else-if="part.type === 'tool'"
                :text="
                  part.state === 'done'
                    ? `${part.label} · ${part.count} 条结果`
                    : part.label
                "
                :loading="part.state === 'running'"
                :streaming="part.state === 'running'"
              >
                <p class="text-sm text-muted">{{ part.detail }}</p>
              </UChatTool>

              <!-- 正文 -->
              <Markdown
                v-else
                :value="part.text"
                :streaming="
                  isStreaming(message) && i === partsOf(message).length - 1
                "
                :plugins="safeMarkdownPlugins"
                class="*:first:mt-0 *:last:mb-0"
              />
            </template>
          </template>
        </template>
      </UChatMessages>

      <!-- 错误提示 -->
      <div v-if="chatError" class="max-w-3xl mx-auto mt-4 flex gap-3 flex-row">
        <div
          class="size-8 rounded-lg flex items-center justify-center shrink-0 bg-red-500/15"
        >
          <Sparkles class="size-4 text-red-400" />
        </div>
        <div
          class="bg-red-900/40 text-red-300 px-4 py-2.5 rounded-2xl rounded-tl-md text-sm"
        >
          {{ chatError }}
        </div>
      </div>
    </div>

    <!-- 排队进度 -->
    <div v-if="queueText" class="px-4 pb-2 shrink-0">
      <div class="max-w-3xl mx-auto text-xs text-muted">
        <UChatShimmer :text="queueText" />
      </div>
    </div>

    <!-- 输入区 -->
    <div class="pb-2 shrink-0">
      <div class="max-w-3xl mx-auto">
        <UChatPrompt
          v-model="input"
          placeholder="问点什么…（回车发送，Shift + 回车换行）"
          :autofocus="false"
          :maxrows="6"
          @submit="onSubmit"
          :ui="{
            footer: 'justify-end',
          }"
        >
          <template #footer>
            <UChatPromptSubmit
              :status="status"
              @stop="stop"
              @reload="regenerate"
            />
          </template>
        </UChatPrompt>
      </div>
    </div>
  </div>
</template>
