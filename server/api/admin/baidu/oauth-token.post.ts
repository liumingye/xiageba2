import { createAuthClient } from "@netdisk-sdk/baidu-sdk";
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

  return {
    accessToken: oauth2Token.accessToken,
    refreshToken: oauth2Token.refreshToken,
    expiresAt: oauth2Token.expiresAt,
  };
});
