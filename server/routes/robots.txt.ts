export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/plain");
  const { protocol, host } = getRequestURL(event);
  return `User-agent: *
Allow: /
Disallow: /admin/
Sitemap: ${protocol}//${host}/sitemap.xml`;
});
