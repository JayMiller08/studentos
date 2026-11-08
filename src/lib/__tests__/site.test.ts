import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig.
import indexHtml from '../../../index.html?raw'
import envExample from '../../../.env.example?raw'
import { DEFAULT_OG_IMAGE, SITE_URL } from '@/lib/site'
import {
  absoluteUrl,
  normalizeSiteUrl,
  PUBLIC_ROUTES,
  robotsTxt,
  SITE_URL_ENV,
  siteUrlProblem,
  sitemapXml,
} from '@/lib/site-config'

/**
 * The site's identity in one place. Every public page, canonical link and
 * sitemap entry is built from PUBLIC_ROUTES and VITE_SITE_URL; these hold the
 * list to what search results can show, and the URL to what a production
 * build may ship.
 */

describe('PUBLIC_ROUTES', () => {
  const paths = PUBLIC_ROUTES.map((route) => route.path)

  it('lists each path once, absolute, with no trailing slash but the home page', () => {
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) {
      expect(path, path).toMatch(/^\//)
      if (path !== '/') expect(path, path).not.toMatch(/\/$/)
      expect(path, path).not.toMatch(/[?#]/)
    }
  })

  it.each(PUBLIC_ROUTES.map((route) => [route.path, route] as const))(
    '%s has a title of at most 60 characters and a description of at most 155',
    (_path, route) => {
      expect(route.title.length, route.title).toBeGreaterThan(10)
      expect(route.title.length, route.title).toBeLessThanOrEqual(60)
      expect(route.description.length, route.description).toBeGreaterThan(50)
      expect(route.description.length, route.description).toBeLessThanOrEqual(155)
    },
  )

  it('gives every page its own title and description', () => {
    expect(new Set(PUBLIC_ROUTES.map((route) => route.title)).size).toBe(PUBLIC_ROUTES.length)
    expect(new Set(PUBLIC_ROUTES.map((route) => route.description)).size).toBe(PUBLIC_ROUTES.length)
  })

  it('dates each page by a source file that exists', () => {
    const sources = import.meta.glob('../../features/**/*.tsx', { query: '?raw', import: 'default', eager: true })
    const known = new Set(Object.keys(sources).map((key) => key.replace('../../', 'src/')))
    for (const route of PUBLIC_ROUTES) expect(known.has(route.source), route.source).toBe(true)
  })
})

describe('the site URL', () => {
  it('is trimmed of trailing slashes', () => {
    expect(normalizeSiteUrl(' https://studentos.co.za// ')).toBe('https://studentos.co.za')
    expect(normalizeSiteUrl('  ')).toBeUndefined()
    expect(normalizeSiteUrl(undefined)).toBeUndefined()
  })

  it('is refused by a production build when missing, not https, or not a bare origin', () => {
    const production = { requireHttps: true }
    expect(siteUrlProblem(undefined, production)).toMatch(new RegExp(`${SITE_URL_ENV} is not set`))
    expect(siteUrlProblem('', production)).toMatch(/is not set/)
    expect(siteUrlProblem('studentos.co.za', production)).toMatch(/is not a URL/)
    expect(siteUrlProblem('http://studentos.co.za', production)).toMatch(/must use https/)
    expect(siteUrlProblem('https://studentos.co.za/app', production)).toMatch(/origin only/)
    expect(siteUrlProblem('https://studentos.co.za?ref=x', production)).toMatch(/origin only/)
    expect(siteUrlProblem('ftp://studentos.co.za', production)).toMatch(/http\(s\)/)
    expect(siteUrlProblem('https://studentos.co.za', production)).toBeNull()
    expect(siteUrlProblem('https://studentos.co.za/', production)).toBeNull()
  })

  it('may be http outside production', () => {
    expect(siteUrlProblem('http://localhost:5173', { requireHttps: false })).toBeNull()
  })

  it('makes absolute URLs and the default share image from it', () => {
    expect(absoluteUrl('https://studentos.co.za', '/terms')).toBe('https://studentos.co.za/terms')
    expect(absoluteUrl('https://studentos.co.za', 'terms')).toBe('https://studentos.co.za/terms')
    expect(DEFAULT_OG_IMAGE.startsWith(`${SITE_URL}/`)).toBe(true)
  })

  it('is documented where a developer sets it up', () => {
    expect(envExample).toMatch(new RegExp(`^${SITE_URL_ENV}=https://`, 'm'))
  })
})

describe('robots.txt and sitemap.xml', () => {
  const site = 'https://studentos.co.za'

  it('lets crawlers reach the private pages, so they can see noindex, but not checkout', () => {
    const robots = robotsTxt(site)
    expect(robots).toContain('User-agent: *')
    expect(robots).toContain('Disallow: /checkout/')
    expect(robots).not.toMatch(/Disallow: \/(app|auth)/)
    expect(robots).toContain(`Sitemap: ${site}/sitemap.xml`)
  })

  it('lists only the pages given, absolute and dated, with nothing Google ignores', () => {
    const xml = sitemapXml(site, [
      { path: '/', lastmod: '2026-10-19' },
      { path: '/terms', lastmod: '2026-08-21' },
    ])
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])).toEqual([`${site}/`, `${site}/terms`])
    expect([...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1])).toEqual(['2026-10-19', '2026-08-21'])
    expect(xml).not.toMatch(/priority|changefreq/)
  })
})

describe('no file names a domain we do not own', () => {
  // Spelled in pieces so this file does not match itself.
  const deadDomain = ['studentos', 'app'].join('.')
  // Where a site URL can live: the public pages, the shared modules, the app
  // shell, the docs and the HTML shell. Not every source file: reading them
  // all slowed the parallel suite enough to time out unrelated editor tests.
  // (Vite needs each glob's options written out inline.)
  const files: Record<string, string> = {
    ...(import.meta.glob('../../features/landing/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
    ...(import.meta.glob('../../lib/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
    ...(import.meta.glob('../../app/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
    ...(import.meta.glob('../../../docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
    'index.html': indexHtml,
    '.env.example': envExample,
  }

  it('across the public pages, src/lib, the app shell, docs, index.html and .env.example', () => {
    // A glob that silently matched nothing would make this vacuous.
    expect(Object.keys(files).length).toBeGreaterThan(40)
    const offenders = Object.entries(files)
      .filter(([, text]) => text.includes(deadDomain))
      .map(([name]) => name)
    expect(offenders).toEqual([])
  })
})
