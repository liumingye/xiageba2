export default defineNuxtPlugin(() => {
  const { load } = useThemeConfig();
  load();
});
