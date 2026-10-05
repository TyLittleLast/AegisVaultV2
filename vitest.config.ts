import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node exposes WebCrypto and fetch globally, so the service and utility
    // layers need no DOM shim. Nothing here renders React.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/services/**/*.ts', 'src/utils/**/*.ts', 'src/data/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 85,
        branches: 85,
      },
    },
  },
})
