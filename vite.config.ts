import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ensureTrailingSlash = (value: string) => {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const explicitBasePath = process.env.VITE_BASE_PATH
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
  const base =
    explicitBasePath ??
    (mode === 'production' && repository ? ensureTrailingSlash(repository) : '/')

  return {
    plugins: [react()],
    base: ensureTrailingSlash(base),
  }
})
