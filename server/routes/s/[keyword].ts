export default defineEventHandler((event) => {
  const keyword = getRouterParam(event, "keyword") || "";
  sendRedirect(event, `/search?q=${encodeURIComponent(keyword)}`, 302);
});
