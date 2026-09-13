<script setup lang="ts">
import {
  ref,
  reactive,
  watch,
  nextTick,
  onMounted,
  onUnmounted,
  computed,
} from "vue";
import { Sparkles, User } from "@lucide/vue";
import { safeMarkdownPlugins } from "~/utils/comark";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const props = defineProps<{
  initialQuery?: string;
}>();

const chatMessages = ref<ChatMessage[]>([]);
const chatContainer = useTemplateRef("chatContainer");
const aiLoading = ref(false);
const aiError = ref("");
let abortController: AbortController | null = null;

const scrollToBottom = async () => {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
};

const sendMessage = async (message?: string) => {
  const content = (message ?? "").trim();
  if (!content || aiLoading.value) return;

  aiError.value = "";
  chatMessages.value.push({ role: "user", content });

  const assistantMsg = reactive<ChatMessage>({
    role: "assistant",
    content: "",
  });
  chatMessages.value.push(assistantMsg);
  aiLoading.value = true;

  await scrollToBottom();

  const controller = new AbortController();
  abortController = controller;

  try {
    const res = await fetch("/api/ai-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `请求失败 (${res.status})`);
    }

    if (!res.body) {
      throw new Error("浏览器不支持流式响应");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

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
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          if (obj.error) throw new Error(obj.error);
          if (obj.chunk) {
            assistantMsg.content += obj.chunk;
            await scrollToBottom();
          }
        } catch (e: any) {
          if (e.name === "AbortError") throw e;
          if (e.message) throw e;
        }
      }
    }

    if (!assistantMsg.content) {
      assistantMsg.content = "(空回复)";
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      if (!assistantMsg.content) {
        const idx = chatMessages.value.indexOf(assistantMsg);
        if (idx > -1) chatMessages.value.splice(idx, 1);
      } else {
        assistantMsg.content += "\n\n[已终止]";
      }
    } else {
      aiError.value = e.message || "AI 搜索出错了，请稍后再试";
      const idx = chatMessages.value.indexOf(assistantMsg);
      if (idx > -1 && !assistantMsg.content) {
        chatMessages.value.splice(idx, 1);
      }
    }
  } finally {
    // 只清理属于本次请求的控制器与状态，避免旧请求的 finally 覆盖新请求
    if (abortController === controller) {
      abortController = null;
      aiLoading.value = false;
    }
    await scrollToBottom();
  }
};

onMounted(() => {
  if (props.initialQuery) {
    sendMessage(props.initialQuery);
  }
});

watch(
  () => props.initialQuery,
  (newQuery, oldQuery) => {
    if (newQuery && newQuery !== oldQuery) {
      // 同步终止上次请求并重置状态，避免 aiLoading 仍为 true 导致新请求被跳过
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      aiLoading.value = false;
      aiError.value = "";
      chatMessages.value = [];
      sendMessage(newQuery);
    }
  },
);

onUnmounted(() => {
  if (abortController) abortController.abort();
});

const showWelcome = computed(() => chatMessages.value.length === 0);
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-120px)]">
    <div ref="chatContainer" class="flex-1 overflow-y-auto px-4 py-4">
      <div class="max-w-3xl mx-auto space-y-4">
        <div v-if="showWelcome && !aiLoading" class="text-center py-12">
          <div
            class="size-16 bg-primary-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4"
          >
            <Sparkles class="size-8 text-primary-400" />
          </div>
          <h2 class="text-lg font-medium mb-2">AI 智能搜索</h2>
          <p class="text-sm text-gray-500 max-w-md mx-auto">
            告诉我你想找什么音乐或资源，即使描述模糊也没关系，我会帮你找到。
          </p>
        </div>

        <div
          v-for="(msg, i) in chatMessages"
          :key="i"
          class="flex gap-3"
          :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
        >
          <div
            class="size-8 rounded-lg flex items-center justify-center shrink-0"
            :class="msg.role === 'user' ? 'bg-elevated' : 'bg-primary-600/20'"
          >
            <User v-if="msg.role === 'user'" class="size-4" />
            <Sparkles v-else class="size-4 text-primary-400" />
          </div>

          <div
            class="max-w-[80%] md:max-w-[75%] rounded-2xl text-sm leading-relaxed wrap-break-word"
            :class="
              msg.role === 'user'
                ? 'bg-primary text-inverted rounded-tr-md'
                : 'bg-elevated rounded-tl-md'
            "
          >
            <template v-if="msg.role === 'assistant'">
              <div class="ai-markdown mx-4 my-2.5">
                <UChatShimmer
                  v-if="!msg.content && aiLoading"
                  text="Thinking..."
                />
                <Markdown
                  v-else
                  :value="msg.content"
                  streaming
                  :plugins="safeMarkdownPlugins"
                  class="*:first:mt-0 *:last:mb-0"
                />
              </div>
              <!-- 有内容：渲染 markdown -->
            </template>
            <div v-else class="whitespace-pre-wrap mx-4 my-2.5">
              {{ msg.content }}
            </div>
          </div>
        </div>

        <div v-if="aiError" class="flex gap-3 flex-row">
          <div
            class="size-8 rounded-lg flex items-center justify-center shrink-0 bg-primary-500/20"
          >
            <Sparkles class="size-4 text-primary-400" />
          </div>
          <div
            class="bg-red-900/40 text-red-300 px-4 py-2.5 rounded-2xl rounded-tl-md text-sm"
          >
            {{ aiError }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
