import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
      exclude: [
        "*.config.ts",
        "*.config.mjs",
        "dist/**",
        "src/main.tsx",
        "src/playground/App.tsx",
        "src/shared/types.ts",
        "src/vite-env.d.ts",
        "src/examples/**",
        "test/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
      ],
    },
  },
});
