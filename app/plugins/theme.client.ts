export default defineNuxtPlugin(() => {
  // 在应用挂载前创建 useColorMode 实例，
  // 确保 <html data-theme> 在首次绘制前生效，避免主题闪烁
  useTheme();
});
