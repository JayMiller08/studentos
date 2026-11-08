/**
 * The site's public identity: who we are, where we live, and which pages
 * search engines may index.
 *
 * No imports and no `import.meta`, on purpose: the build (vite.config.ts and
 * the robots/sitemap generator) reads this file in Node, where neither the
 * app's env module nor the browser exists. The app reads it through
 * `src/lib/site.ts`, which adds the deployment's own URL from `VITE_SITE_URL`.
 */

export const SITE_NAME = 'StudentOS'

/** The company behind the product, for legal pages and structured data. */
export const ORG_NAME = 'DAC Technologies (Pty) Ltd'

/** Where students write to us. A mailbox, so not derived from the site URL. */
export const SUPPORT_EMAIL = 'support@studentos.co.za'

/** Official social profiles, for Organization `sameAs`. None yet. */
export const SOCIAL_PROFILES: readonly string[] = []

/** The share image, as a path on the site. Made absolute with the site URL. */
export const DEFAULT_OG_IMAGE_PATH = '/icons/icon-512.png'

/** The environment variable that holds the public origin, e.g. https://studentos.co.za. */
export const SITE_URL_ENV = 'VITE_SITE_URL'

export type ChangeFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface PublicRoute {
  /** Starts with `/`, no trailing slash except the home page itself. */
  path: string
  /** At most 60 characters, so search results show it whole. */
  title: string
  /** At most 155 characters, for the same reason. */
  description: string
  changefreq: ChangeFrequency
  /** The file whose last commit dates the page in the sitemap. */
  source: string
}

/**
 * Every page search engines should index, and nothing else. The sitemap, the
 * prerender and the per-page metadata all read this list; a page that is not
 * here is treated as private.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    path: '/',
    title: 'Study planner & quiz maker for uni students | StudentOS',
    description:
      'Plan assignments, turn lecture PDFs into quizzes, and stay on track with a Pomodoro timer and habit tracker. Made for South African university students.',
    changefreq: 'weekly',
    source: 'src/features/landing/landing-page.tsx',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy (POPIA) | StudentOS',
    description:
      "How StudentOS collects, uses and protects your personal information under South Africa's POPIA, and how to access, correct or delete your data.",
    changefreq: 'yearly',
    source: 'src/features/landing/privacy-page.tsx',
  },
  {
    path: '/terms',
    title: 'Terms of Service | StudentOS',
    description:
      'The terms for using StudentOS: your account, subscriptions billed in Rand through Paystack, acceptable use, and your rights under South African law.',
    changefreq: 'yearly',
    source: 'src/features/landing/terms-page.tsx',
  },
]

/** A site URL as configured: trimmed, without trailing slashes. */
export function normalizeSiteUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, '')
  return trimmed ? trimmed : undefined
}

/**
 * What is wrong with a configured site URL, or null. It must be a bare
 * origin — no path, query or fragment — and, for a production build, https.
 */
export function siteUrlProblem(raw: string | undefined, { requireHttps }: { requireHttps: boolean }): string | null {
  const value = normalizeSiteUrl(raw)
  if (!value) return `${SITE_URL_ENV} is not set. Set it to the public origin, e.g. https://studentos.co.za.`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return `${SITE_URL_ENV} is not a URL: "${value}".`
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return `${SITE_URL_ENV} must be an http(s) URL.`
  if (requireHttps && url.protocol !== 'https:') return `${SITE_URL_ENV} must use https:// for a production build.`
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    return `${SITE_URL_ENV} must be an origin only, like https://studentos.co.za — not "${value}".`
  }
  return null
}

/** An absolute URL on the site: the origin plus a path starting with `/`. */
export function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * robots.txt. Everything may be crawled — including /app and /auth, whose
 * pages say `noindex` and must be fetchable for that to be seen — except the
 * checkout pages, which have nothing for a crawler to read.
 */
export function robotsTxt(siteUrl: string): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /checkout/', '', `Sitemap: ${absoluteUrl(siteUrl, '/sitemap.xml')}`, ''].join('\n')
}

/**
 * sitemap.xml: the indexable pages only, each dated by `lastmod`
 * (yyyy-MM-dd). No priority or changefreq: Google ignores both.
 */
export function sitemapXml(siteUrl: string, pages: readonly { path: string; lastmod: string }[]): string {
  const urls = pages.map(
    (page) => `  <url>\n    <loc>${absoluteUrl(siteUrl, page.path)}</loc>\n    <lastmod>${page.lastmod}</lastmod>\n  </url>`,
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}
