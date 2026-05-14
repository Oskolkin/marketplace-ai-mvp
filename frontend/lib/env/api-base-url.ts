/**
 * Single source for the backend HTTP origin used by the browser and server-side fetches.
 * Default matches local API in this repo (see backend listen port).
 */
export const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8081";
