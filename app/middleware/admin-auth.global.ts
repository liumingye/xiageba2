/**
 * 后台路由鉴权
 *
 * 后台路由在 nuxt.config 里配了 `ssr: false`，登录态存在 localStorage，
 * 服务端读不到也不该判断，因此这个守卫只在客户端生效。
 *
 * 取代原先 22 个后台页面各自复制一遍的 onMounted 守卫。那套写法里还有一句
 * `await new Promise((r) => setTimeout(r, 100))`，注释说是"等 localStorage 读出来"，
 * 但 useAuth 里 `initialized` 在组合式函数内部已经同步置位，这 100ms 纯属
 * 每次进入后台页凭空多等一拍。
 *
 * 放到中间件后还有两个附带好处：
 * - 未登录时在组件挂载前就跳走，页面拿不到机会发第一轮请求
 * - 跳转带上 redirect，登录后能回到原来那一页（login 页已有防开放跳转校验）
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;
  if (!to.path.startsWith("/admin")) return;
  if (to.path === "/admin/login") return;

  const { isLoggedIn } = useAuth();
  if (!isLoggedIn.value) {
    return navigateTo({
      path: "/admin/login",
      query: { redirect: to.fullPath },
    });
  }
});
