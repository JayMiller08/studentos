import { env } from '@/lib/env'
import { absoluteUrl as absoluteOn, DEFAULT_OG_IMAGE_PATH } from '@/lib/site-config'

/**
 * The site's identity, for the app: everything in site-config.ts plus this
 * deployment's public origin from `VITE_SITE_URL` (validated in env.ts; a
 * production build refuses to run without it — see vite.config.ts).
 */

export {
  ORG_NAME,
  PUBLIC_ROUTES,
  SITE_NAME,
  SOCIAL_PROFILES,
  SUPPORT_EMAIL,
  type PublicRoute,
} from '@/lib/site-config'

/** The public origin, e.g. https://studentos.co.za — no trailing slash. */
export const SITE_URL: string = env.siteUrl

/** The host alone, e.g. studentos.co.za, for display. */
export const SITE_HOST: string = new URL(SITE_URL).host

/** An absolute URL on this site, from a path starting with `/`. */
export function absoluteUrl(path: string): string {
  return absoluteOn(SITE_URL, path)
}

/** The default share image, absolute, as Open Graph requires. */
export const DEFAULT_OG_IMAGE: string = absoluteUrl(DEFAULT_OG_IMAGE_PATH)
