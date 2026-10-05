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
 * widths. That is a far smaller exposure than inline script.
 *
 * `script-src` needs 'wasm-unsafe-eval' because Argon2id comes from
 * `hash-wasm`, which is a WebAssembly build: without this keyword the browser
 * refuses to compile the module and the master password can neither be hashed
 * nor checked, so the vault can be neither created nor opened. The keyword is
 * supported by Chrome, Firefox (102+) and Safari, and unlike 'unsafe-eval' it
 * does not enable general evaluation of JavaScript. 'unsafe-inline' stays out,
 * so injecting a script tag remains impossible.
 *
 * `font-src` and `img-src` stay at `'self'`. Vite inlines any asset below
 * `assetsInlineLimit` (4 KB by default) and one @fontsource subset fell under
 * it, so that subset became a `url(data:font/woff2;base64,…)` reference which
 * `font-src 'self'` blocked; a handful of glyphs silently fell back to a system
 * face and no build output said so. `assetsInlineLimit: 0` in `build` below
 * stops the inlining rather than widening the policy to match it, which also
 * drops a font that used to be shipped twice — once base64 in the stylesheet,
 * once as a real file.
 *
 * The two remaining relaxations are consequences of the toolchain too:
 * `wasm-unsafe-eval` because Argon2id is a WASM module, `'unsafe-inline'` for
 * `style-src` because React writes inline `style` attributes. Neither can be
 * asserted from the bundle, so they are stated here. `.github/workflows/ci.yml`
 * checks the rest of the policy against the real build output, so a toolchain
 * change cannot reopen the inlining question without failing a run.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
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
 * Public path the build is served from.
 *
 * GitHub Pages publishes this project under a repository sub-path
 * (`https://<owner>.github.io/AegisVaultV2/`), so a deploy build needs
 * sub-path-absolute URLs. An empty base would resolve `/assets/...` against
 * the domain root and 404 on every asset.
 *
 * It comes from `PUBLIC_BASE` rather than from the Vite command on purpose.
 * Deriving it from the command tied `vite preview` to the deploy path, so
 * previewing a production build only worked at the prefixed URL — a trap, not
 * a deployment detail. Now the default is the origin root, which is what both
 * `npm run dev` and `npm run preview` serve, and the two builds that target
 * Pages (the deploy job and the bundle audit) opt in explicitly via the
 * environment, so the audited artefact is byte-for-byte the deployed one.
 *
 * @see .github/workflows/deploy.yml
 */
function publicPath(): string {
  const configured = process.env.PUBLIC_BASE
  if (configured === undefined || configured === '') return '/'
  if (!configured.startsWith('/') || !configured.endsWith('/')) {
    // A base without the trailing slash silently produces assets that resolve
    // one directory too high, which is far harder to diagnose than a throw.
    throw new Error(`PUBLIC_BASE must start and end with "/", got "${configured}"`)
  }
  return configured
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
function pwaOptions(base: string) {
  return {
    registerType: 'autoUpdate' as const,
    includeAssets: [`${base}shield.svg`, `${base}shield-maskable.svg`],
    manifest: {
      name: 'AegisVault — coffre-fort local',
      short_name: 'AegisVault',
      description:
        'Coffre-fort de mots de passe 100 % local. Aucun serveur, aucun compte, aucune télémétrie.',
      lang: 'fr',
      dir: 'ltr',
      // Absolute, not relative: a relative start_url would resolve against
      // whatever directory the browser happens to be in.
      start_url: base,
      scope: base,
      display: 'standalone',
      orientation: 'any',
      background_color: '#F5F2EC',
      theme_color: '#F5F2EC',
      categories: ['utilities', 'security', 'productivity'],
      icons: [
        {
          src: `${base}shield.svg`,
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
        {
          src: `${base}shield-maskable.svg`,
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
}

export default defineConfig(() => {
  const base = publicPath()

  return {
    base,
    plugins: [react(), tailwindcss(), contentSecurityPolicy(), VitePWA(pwaOptions(base))],
    build: {
      target: 'es2022',
      sourcemap: false,
      assetsInlineLimit: 0,
    },
  }
})
