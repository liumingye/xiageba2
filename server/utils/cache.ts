export async function clearCacheNitroHandlers(key = "") {
  const storage = useStorage(`cache:nitro:handlers:${key}`);
  const keys = await storage.getKeys();
  for (const k of keys) {
    await storage.removeItem(k);
  }
}
