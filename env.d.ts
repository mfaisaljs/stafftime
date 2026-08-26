/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    PORTAL_URL?: string;
    PORTAL_HOST?: string;
    SHOPIFY_APP_URL?: string;
    SHOPIFY_API_SECRET?: string;
    PORTAL_SESSION_SECRET?: string;
    ADMIN_EMAIL?: string;
    EMAIL_HOST?: string;
    EMAIL_USER?: string;
    EMAIL_PASS?: string;
    EMAIL_PORT?: string;
    EMAIL_FROM?: string;
  }
}
