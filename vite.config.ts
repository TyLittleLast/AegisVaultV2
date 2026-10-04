import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Production Content-Security-Policy.
 *
 * Injected at build time rather than hardcoded in index.html: the dev server
 * relies on inline bootstrap scripts and a HMR websocket, so a static policy
 * would break `vite dev`.
 *
 * `connect-src` is the load-bearing directive here. It reduces this app's
 * outbound network capability to exactly one host, so "no server" stops being
 * a claim in the README and becomes a constraint the browser enforces.
 *
 * `style-src` still needs 'unsafe-inline' because strength meters set inline
 * widths. That is a far smaller exposure than inline script, and `script-src`
 * stays locked to 'self'.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://api.pwnedpasswords.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'aegisvault:csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})