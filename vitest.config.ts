import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node exposes WebCrypto and fetch globally, so the service and utility
    // layers need no shims. jsdom is here for the component tests, which render
    // React for real; it is layered on top of the Node globals rather than
    // replacing them, so `crypto.subtle` keeps working for the crypto suite.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'src/services/**/*.ts',
        'src/utils/**/*.ts',
        'src/data/**/*.ts',
        'src/components/**/*.tsx',
      ],
      exclude: ['**/*.test.{ts,tsx}'],
      // A single global ratchet, set just under what the suite actually
      // achieves today. It is not a claim that the app is covered.
      //
      // Per-glob thresholds (an array) are silently ignored by Vitest 5.0.3,
      // so the honest option is one number per metric. The layers that matter
      // are far above it — cryptoService 100% lines, vaultSchema 100%,
      // hibpService 100%, brandIcons 100% — while GeneratorTab (3%) and
      // SettingsTab (2%) drag the global figure down. Raise this floor as the
      // remaining UI gets tests; do not lower it.
      thresholds: {
        lines: 64,
        statements: 63,
        functions: 56,
        branches: 52,
      },
    },
  },
})
