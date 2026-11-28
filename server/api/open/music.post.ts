import { createMusic } from "#server/lib/musicService";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return createMusic(body);
});
