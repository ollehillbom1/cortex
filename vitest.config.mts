import { defineConfig } from "vitest/config";
import path from "node:path";

// Two projects so each test kind gets the right environment automatically:
// plain .ts tests stay in fast node, .tsx component tests get jsdom. The
// previous config included only "src/**/*.test.ts" — a .tsx test was
// silently ignored, which is how five react-hooks violations in components
// survived until an ESLint upgrade happened to catch them.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
        },
      },
    ],
  },
});
