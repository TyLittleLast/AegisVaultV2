import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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

/**
 * Offline shell.
 *
 * Only the built application is precached. No runtime caching rules are
 * registered at all, which is deliberate: the one network call this app makes
 * is the HIBP k-anonymity lookup, and a service worker must never be in a
 * position to answer it from cache. Vault data lives in IndexedDB and is
 * untouched by any of this.
 *
 * `autoUpdate` means a new deploy replaces the old shell without prompting,
 * which is the right trade for a single-page app with no server coordination.
 */
const PWA_OPTIONS = {
  registerType: 'autoUpdate' as const,
  includeAssets: ['shield.svg', 'shield-maskable.svg'],
  manifest: {
    name: 'AegisVault — coffre-fort local',
    short_name: 'AegisVault',
    description:
      'Coffre-fort de mots de passe 100 % local. Aucun serveur, aucun compte, aucune télémétrie.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F5F2EC',
    theme_color: '#F5F2EC',
    categories: ['utilities', 'security', 'productivity'],
    icons: [
      {
        src: '/shield.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/shield-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    // woff2 is included so the app is genuinely usable offline, not just
    // bootable: without the fonts the shell renders in a fallback face.
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    cleanupOutdatedCaches: true,
  },
  devOptions: {
    // A service worker in dev would serve a stale shell and mask real changes.
    enabled: false,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy(), VitePWA(PWA_OPTIONS)],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
