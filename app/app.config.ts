export default defineAppConfig({
  ui: {
    colors: {
      primary: "green",
      neutral: "zinc",
    },
    navigationMenu: {
      variants: {
        active: {
          false: {
            link: "text-toned",
            linkLeadingIcon: "text-toned",
          },
        },
      },
    },
    modal: {
      slots: {
        wrapper: "mr-9", // 防止标题过长挡住关闭按钮
      },
    },
    prose: {
      p: { base: "my-2 leading-6" },
      li: { base: "my-0.5 leading-6" },
      ul: { base: "my-2" },
      ol: { base: "my-2" },
      h1: { slots: { base: "text-xl my-2" } },
      h2: { slots: { base: "text-lg my-2" } },
      h3: { slots: { base: "text-base my-2" } },
      h4: { slots: { base: "text-sm my-2" } },
      pre: { slots: { root: "my-2" } },
      table: { slots: { root: "my-2" } },
      hr: { base: "my-2" },
    },
  },
});
