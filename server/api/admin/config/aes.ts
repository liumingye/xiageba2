import { createConfigKVHandler } from "#server/utils/admin";

const AES_KEYS = ["aes_key", "aes_iv"];

export default createConfigKVHandler(AES_KEYS);
