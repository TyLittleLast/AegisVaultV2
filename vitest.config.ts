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
      // hibpService 100%, brandIcons 100% — while MainLayout (57%) and the
      // panels behind it still drag the global figure down. Raise this floor
      // as the remaining UI gets tests; do not lower it.
      //
      // Raised from 64/63/56/52 after GeneratorTab and SettingsTab gained
      // tests: 205 -> 238 tests, 63.8% -> 74.7% statements.
      thresholds: {
        lines: 75,
        statements: 73,
        functions: 68,
        branches: 59,
      },
    },
  },
})
