/**
 * Canonical origin of the deployed site.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_SITE_URL — explicit override (set this in Vercel project settings)
 *  2. VERCEL_PROJECT_PRODUCTION_URL — production domain, exposed automatically on Vercel
 *  3. VERCEL_URL — per-deployment URL, exposed automatically on Vercel
 *  4. localhost for local development
 */
const fromEnv =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const SITE_URL = (fromEnv ?? "http://localhost:3000").replace(/\/+$/, "");
