import { createAuthClient } from "@netdisk-sdk/baidu-sdk";
import { setConfigValues } from "#server/lib/configCache";
import { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } from "#server/lib/const";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const code = body.code as string;
  const codeVerifier = body.codeVerifier as string;

  if (!code || !codeVerifier) {
    throw createError({
      statusCode: 400,
      message: "缺少 code 或 codeVerifier",
    });
  }

  const authClient = createAuthClient(BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET);

  const oauth2Token =
    await authClient.authorizationCode.getTokenFromCodeRedirect(
      `https://openapi.baidu.com/oauth/2.0/authorize?code=${code}`,
      {
        redirectUri: "oob",
        codeVerifier,
      },
    );

  const configs = [];
  if (oauth2Token.accessToken) {
    configs.push({
      key: "baidu_access_token",
      value: oauth2Token.accessToken,
    });
  }
  if (oauth2Token.refreshToken) {
    configs.push({
      key: "baidu_refresh_token",
      value: oauth2Token.refreshToken,
    });
  }
  if (oauth2Token.expiresAt) {
    configs.push({
      key: "baidu_expires_at",
      value: String(oauth2Token.expiresAt),
    });
  }

  setConfigValues(configs);

  return {
    accessToken: oauth2Token.accessToken,
    refreshToken: oauth2Token.refreshToken,
    expiresAt: oauth2Token.expiresAt,
  };
});
