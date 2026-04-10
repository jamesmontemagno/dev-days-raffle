import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const ensureTrailingSlash = (value: string) => {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), '')
  const explicitBasePath = loadedEnv.VITE_BASE_PATH || process.env.VITE_BASE_PATH
  const repository = loadedEnv.GITHUB_REPOSITORY?.split('/')[1] ?? process.env.GITHUB_REPOSITORY?.split('/')[1]
  const localNamesFile = loadedEnv.VITE_LOCAL_NAMES_FILE || '/names.csv'
  const base =
    explicitBasePath ??
    (mode === 'production' && repository ? ensureTrailingSlash(repository) : '/')

  const localRafflePersistPlugin = (): Plugin => ({
    name: 'local-raffle-csv-persist',
    apply: 'serve',
    configureServer(server) {
      const rootPath = server.config.root
      const publicPath = path.resolve(rootPath, 'public')
      const relativeCsv = localNamesFile.startsWith('/') ? localNamesFile.slice(1) : localNamesFile
      const csvPath = path.resolve(publicPath, relativeCsv)
      const isInsidePublicDir = csvPath.startsWith(publicPath)
      const isCsvFile = csvPath.toLowerCase().endsWith('.csv')

      server.middlewares.use('/__local-raffle/persist', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'Method not allowed.' }))
          return
        }

        if (!isInsidePublicDir || !isCsvFile) {
          response.statusCode = 400
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'Configured local CSV path is invalid.' }))
          return
        }

        let body = ''
        request.setEncoding('utf8')
        request.on('data', (chunk) => {
          body += chunk
        })
        request.on('end', async () => {
          try {
            const payload = JSON.parse(body) as { csv?: string }
            if (typeof payload.csv !== 'string' || payload.csv.trim().length === 0) {
              response.statusCode = 400
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: 'CSV payload is required.' }))
              return
            }

            await mkdir(path.dirname(csvPath), { recursive: true })
            await writeFile(csvPath, payload.csv.endsWith('\n') ? payload.csv : `${payload.csv}\n`, 'utf8')

            response.statusCode = 200
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ ok: true }))
          } catch {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'Unable to persist local CSV entries.' }))
          }
        })
      })
    },
  })

  return {
    plugins: [react(), localRafflePersistPlugin()],
    base: ensureTrailingSlash(base),
  }
})
