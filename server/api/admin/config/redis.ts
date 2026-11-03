import { createConfigKVHandler } from "#server/utils/admin";

const REDIS_KEYS = ["redis_host", "redis_port", "redis_db", "redis_password"];

export default createConfigKVHandler(REDIS_KEYS);
