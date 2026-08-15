export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/plain");
  const { protocol, host } = getRequestURL(event);
  return `User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /
Disallow: /admin/

User-agent: Amazonbot
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: CloudflareBrowserRenderingCrawler
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: meta-externalagent
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: YouBot
Disallow: /

User-agent: OAI‑SearchBot
Disallow: /

Sitemap: ${protocol}//${host}/sitemap.xml`;
});
