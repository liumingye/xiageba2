import { type NuxtError } from "nuxt/app";

export interface ApiErrorResponse extends NuxtError {
  data?: {
    message?: string;
    error?: string;
    statusCode?: number;
  };
}
