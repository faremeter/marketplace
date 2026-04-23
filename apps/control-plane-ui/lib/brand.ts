/* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty env vars should fall back to defaults */
export const SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_NAME || "Faremeter Marketplace";
export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.faremeter.xyz";
export const SALES_EMAIL =
  process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@faremeter.xyz";
export const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL ?? "";
