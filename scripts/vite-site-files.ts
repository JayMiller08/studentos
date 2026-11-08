/**
 * Site files the build writes from `src/lib/site-config.ts`, so the public
 * origin lives in one place (`VITE_SITE_URL`) instead of being typed into
 * static files:
 *
 *   robots.txt    everything crawlable except /checkout/, plus the sitemap
 *   sitemap.xml   PUBLIC_ROUTES only, each dated by its source file's last
 *                 commit (the build date when git cannot say)
 *
 * It also refuses a production build without a usable `VITE_SITE_URL`: a
 * site that ships canonical links to the wrong origin tells search engines to
 * index somewhere else.
 */
import { execFileSync } from 'node:child_process'
import { loadEnv, type Plugin } from 'vite'
import {
  normalizeSiteUrl,
  PUBLIC_ROUTES,
  robotsTxt,
  SITE_URL_ENV,
  siteUrlProblem,
  sitemapXml,
} from '../src/lib/site-config.ts'

/** Stands in for the site URL in development, where nothing is indexed. */
const DEV_SITE_URL = 'http://localhost:5173'

/** yyyy-MM-dd of a file's last commit, or null when git cannot say (no repo, shallow clone, new file). */
function lastCommitDate(file: string, root: string): string | null {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: root, encoding: 'utf8' }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
  } catch {
    return null
  }
}

export function siteFiles(): Plugin {
  let siteUrl = DEV_SITE_URL
  let root = process.cwd()

  const files = () => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      'robots.txt': robotsTxt(siteUrl),
      'sitemap.xml': sitemapXml(
        siteUrl,
        PUBLIC_ROUTES.map((route) => ({ path: route.path, lastmod: lastCommitDate(route.source, root) ?? today })),
      ),
    }
  }

  return {
    name: 'studentos-site-files',

    config(userConfig, { command, mode }) {
      root = userConfig.root ?? process.cwd()
      const env = loadEnv(mode, root, 'VITE_')
      const production = mode === 'production' || env.VITE_APP_ENV === 'production'
      if (command === 'build' && production) {
        const problem = siteUrlProblem(env[SITE_URL_ENV], { requireHttps: true })
        if (problem) throw new Error(`[site] ${problem}`)
      }
      siteUrl = normalizeSiteUrl(env[SITE_URL_ENV]) ?? DEV_SITE_URL
    },

    // Until the per-page <Seo> component lands, index.html carries the site's
    // identity through this token.
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', siteUrl)
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split('?')[0]?.replace(/^\//, '')
        const body = name ? files()[name as keyof ReturnType<typeof files>] : undefined
        if (!body) return next()
        response.setHeader('Content-Type', name === 'robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8')
        response.end(body)
      })
    },

    generateBundle() {
      for (const [fileName, source] of Object.entries(files())) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}
