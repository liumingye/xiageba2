import { createAuthClient, generateCodeVerifier } from "@netdisk-sdk/baidu-sdk";
import { BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET } from "~~/server/api/const";

export default defineEventHandler(async () => {
  const authClient = createAuthClient(BAIDU_CLIENT_ID, BAIDU_CLIENT_SECRET);

  const codeVerifier = await generateCodeVerifier();
  const url = await authClient.authorizationCode.getAuthorizeUri({
    redirectUri: "oob",
    codeVerifier,
    scope: ["netdisk"],
  });

  return { url, codeVerifier };
});
