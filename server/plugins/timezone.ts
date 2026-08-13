export default defineNitroPlugin(() => {
  // 设置服务端环境变量时区
  process.env.TZ = "Asia/Shanghai";
  console.log(`[Nuxt Server] 时区已设置为: ${process.env.TZ}`);
});
