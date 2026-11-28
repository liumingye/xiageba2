import { createSources } from "#server/lib/sourceService";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return createSources(body);
});
