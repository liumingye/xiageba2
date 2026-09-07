<script setup lang="ts">
import { computed } from "vue";
import type { EditorToolbarItem, EditorSuggestionMenuItem } from "@nuxt/ui";

defineOptions({ name: "Editor" });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
  }>(),
  {
    modelValue: "",
    placeholder: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const model = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});

// 输入模式：false=富文本(Markdown)，true=纯文本（内容原样保存，不做 Markdown 解析）
const plain = ref(false);

const markdownPlaceholder = computed(
  () => props.placeholder || "支持 Markdown 语法，输入 / 可唤起快捷菜单…",
);
const plainPlaceholder = computed(
  () => props.placeholder || "输入纯文本内容，换行将原样保留…",
);

// 顶部固定工具栏（按组划分，组间自动插入分隔线）
const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: "undo", icon: "i-lucide-undo-2", tooltip: { text: "撤销" } },
    { kind: "redo", icon: "i-lucide-redo-2", tooltip: { text: "重做" } },
  ],
  [
    {
      kind: "mark",
      mark: "bold",
      icon: "i-lucide-bold",
      tooltip: { text: "加粗" },
    },
    {
      kind: "mark",
      mark: "italic",
      icon: "i-lucide-italic",
      tooltip: { text: "斜体" },
    },
    {
      kind: "mark",
      mark: "strike",
      icon: "i-lucide-strikethrough",
      tooltip: { text: "删除线" },
    },
    {
      kind: "mark",
      mark: "underline",
      icon: "i-lucide-underline",
      tooltip: { text: "下划线" },
    },
    {
      kind: "mark",
      mark: "code",
      icon: "i-lucide-code",
      tooltip: { text: "行内代码" },
    },
  ],
  [
    {
      icon: "i-lucide-heading",
      tooltip: { text: "标题" },
      content: { align: "start" },
      items: [
        {
          kind: "heading",
          level: 1,
          label: "一级标题",
          icon: "i-lucide-heading-1",
        },
        {
          kind: "heading",
          level: 2,
          label: "二级标题",
          icon: "i-lucide-heading-2",
        },
        {
          kind: "heading",
          level: 3,
          label: "三级标题",
          icon: "i-lucide-heading-3",
        },
        { kind: "paragraph", label: "正文", icon: "i-lucide-type" },
      ],
    },
    {
      icon: "i-lucide-list",
      tooltip: { text: "列表" },
      content: { align: "start" },
      items: [
        { kind: "bulletList", label: "无序列表", icon: "i-lucide-list" },
        {
          kind: "orderedList",
          label: "有序列表",
          icon: "i-lucide-list-ordered",
        },
      ],
    },
    {
      kind: "blockquote",
      icon: "i-lucide-text-quote",
      tooltip: { text: "引用" },
    },
    {
      kind: "codeBlock",
      icon: "i-lucide-square-code",
      tooltip: { text: "代码块" },
    },
    {
      kind: "horizontalRule",
      icon: "i-lucide-separator-horizontal",
      tooltip: { text: "分割线" },
    },
  ],
  [
    { kind: "link", icon: "i-lucide-link", tooltip: { text: "链接" } },
    { kind: "image", icon: "i-lucide-image", tooltip: { text: "图片" } },
  ],
  [
    {
      kind: "clearFormatting",
      icon: "i-lucide-remove-formatting",
      tooltip: { text: "清除格式" },
    },
  ],
];

// 选中文字时弹出的浮动工具栏
const bubbleItems = (editor: any): EditorToolbarItem[][] => {
  if (editor.isActive("image")) {
    const node = editor.state.doc.nodeAt(editor.state.selection.from);
    return [
      [
        {
          icon: "i-lucide-download",
          to: node?.attrs?.src,
          download: true,
          target: "_blank",
          tooltip: { text: "Download" },
        },
      ],
      [
        {
          icon: "i-lucide-trash",
          tooltip: { text: "Delete" },
          onClick: () => {
            const { state } = editor;
            const { selection } = state;

            const pos = selection.from;
            const node = state.doc.nodeAt(pos);

            if (node && node.type.name === "image") {
              editor
                .chain()
                .focus()
                .deleteRange({ from: pos, to: pos + node.nodeSize })
                .run();
            }
          },
        },
      ],
    ];
  }

  return [
    [
      {
        kind: "mark",
        mark: "bold",
        icon: "i-lucide-bold",
        tooltip: { text: "加粗" },
      },
      {
        kind: "mark",
        mark: "italic",
        icon: "i-lucide-italic",
        tooltip: { text: "斜体" },
      },
      {
        kind: "mark",
        mark: "strike",
        icon: "i-lucide-strikethrough",
        tooltip: { text: "删除线" },
      },
      {
        kind: "mark",
        mark: "code",
        icon: "i-lucide-code",
        tooltip: { text: "行内代码" },
      },
      { kind: "link", icon: "i-lucide-link", tooltip: { text: "链接" } },
    ],
  ];
};

// 输入 / 唤起的快捷菜单
const suggestionItems: EditorSuggestionMenuItem[] = [
  { type: "label", label: "排版" },
  {
    kind: "paragraph",
    label: "正文",
    description: "普通段落",
    icon: "i-lucide-type",
  },
  {
    kind: "heading",
    level: 1,
    label: "一级标题",
    description: "## 标题",
    icon: "i-lucide-heading-1",
  },
  {
    kind: "heading",
    level: 2,
    label: "二级标题",
    description: "### 标题",
    icon: "i-lucide-heading-2",
  },
  {
    kind: "heading",
    level: 3,
    label: "三级标题",
    description: "#### 标题",
    icon: "i-lucide-heading-3",
  },
  {
    kind: "blockquote",
    label: "引用",
    description: "引用一段话",
    icon: "i-lucide-text-quote",
  },
  { type: "label", label: "列表" },
  {
    kind: "bulletList",
    label: "无序列表",
    description: "• 列表项",
    icon: "i-lucide-list",
  },
  {
    kind: "orderedList",
    label: "有序列表",
    description: "1. 列表项",
    icon: "i-lucide-list-ordered",
  },
  { type: "label", label: "插入" },
  {
    kind: "codeBlock",
    label: "代码块",
    description: "``` code ```",
    icon: "i-lucide-square-code",
  },
  {
    kind: "horizontalRule",
    label: "分割线",
    description: "---",
    icon: "i-lucide-separator-horizontal",
  },
];
</script>

<template>
  <div class="editor-shell w-full rounded-lg border border-muted bg-default">
    <div class="flex items-center gap-3 border-b border-muted px-2.5 py-1">
      <p class="mr-auto hidden truncate text-xs text-muted sm:block">
        {{
          plain
            ? "纯文本：内容原样保存，不做 Markdown 解析"
            : "富文本：所见即所得，支持 Markdown 语法与排版"
        }}
      </p>

      <div
        class="flex shrink-0 items-center gap-0.5 rounded-md bg-elevated p-0.5"
        role="group"
        aria-label="输入模式"
      >
        <button
          type="button"
          class="rounded px-2 py-0.5 text-xs font-medium transition-colors"
          :class="
            plain ? 'text-muted hover:text-highlighted' : 'bg-default shadow-sm'
          "
          @click="plain = false"
        >
          富文本
        </button>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-xs font-medium transition-colors"
          :class="
            plain ? 'bg-default shadow-sm' : 'text-muted hover:text-highlighted'
          "
          @click="plain = true"
        >
          纯文本
        </button>
      </div>
    </div>

    <textarea
      v-if="plain"
      v-model="model"
      :placeholder="plainPlaceholder"
      class="block min-h-60 w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-0"
    />

    <UEditor
      v-else
      v-model="model"
      content-type="markdown"
      :placeholder="markdownPlaceholder"
    >
      <template #default="{ editor }">
        <UEditorToolbar
          :editor="editor"
          :items="toolbarItems"
          class="flex flex-wrap gap-y-0.5 overflow-x-auto border-b border-color-300 px-2 py-1"
        />

        <UEditorToolbar
          :editor="editor"
          :items="bubbleItems(editor)"
          layout="bubble"
        />

        <UEditorSuggestionMenu :editor="editor" :items="suggestionItems" />

        <UEditorDragHandle :editor="editor" />
      </template>
    </UEditor>
  </div>
</template>

<style scoped>
.editor-shell :deep(.tiptap) {
  min-height: 240px;
  outline: none;
}

.editor-shell :deep(.tiptap > *:first-child) {
  margin-top: 0;
}

.editor-shell :deep(.tiptap > *:last-child) {
  margin-bottom: 0;
}
</style>
