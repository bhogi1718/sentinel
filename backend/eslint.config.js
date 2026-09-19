const js = require("@eslint/js");
const globals = require("globals");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Lint-time only, wider than tsconfig.json - that one excludes
        // *.test.ts/src/test so the production build (tsc -p tsconfig.json)
        // never tries to compile Vitest-only files against a machine that
        // may not have vitest installed (devDependencies can be omitted in
        // production installs). ESLint's type-aware rules still need every
        // source file, tests included, to be part of *some* project.
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs["recommended-requiring-type-checking"].rules,
      // TypeScript's own compiler (via parserOptions.project above) already
      // catches every real case no-undef exists for, and it doesn't
      // understand type-only positions like `NodeJS.Timeout` - the
      // typescript-eslint project itself recommends disabling this rule
      // for .ts files rather than chasing type-namespace false positives.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Route files pass object-literal controller methods (e.g.
    // `authController.login`) directly to router.get/post - those methods
    // never reference `this` (they take req/res as plain params), so the
    // reference is safe despite unbound-method's static warning. Rewriting
    // every controller to arrow-function properties just to satisfy a
    // false positive isn't worth the churn across the whole routing layer.
    files: ["src/**/*.routes.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    // Test files reference vi.fn()-mocked methods the same way - same
    // false positive, scoped the same way.
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "prisma/migrations/**"],
  },
];
