import { type NuxtError } from "nuxt/app";

export interface ApiErrorResponse extends NuxtError {
  data?: {
    message?: string;
    statusCode?: number;
  };
}
