import {
  OAuth2Client,
  OAuth2Fetch,
  OAuth2Token,
  OAuth2Error,
  generateCodeVerifier,
} from "@badgateway/oauth2-client";
export type { OAuth2Token };
export { generateCodeVerifier };

import { Await, ConstructorArgType } from "@netdisk-sdk/utils";

export const createAuthClient = (
  clientId: string,
  clientSecret: string,
  fetch_?: typeof fetch,
) => {
  const client = new OAuth2Client({
    server: "http://openapi.baidu.com",
    clientId,
    clientSecret,
    tokenEndpoint: "/oauth/2.0/token",
    authorizationEndpoint: "/oauth/2.0/authorize",
    authenticationMethod: "client_secret_post",
    fetch: fetch_,
  });
  return client;
};

export const createOAuth2Fetch = (
  option: ConstructorArgType<typeof OAuth2Fetch>,
) => {
  return new OAuth2Fetch(option);
};
