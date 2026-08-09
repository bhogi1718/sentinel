// Vitest setupFiles hook: env.ts validates process.env at import time via
// a Zod schema and calls process.exit(1) if required vars are missing -
// tests must never depend on a developer's local .env file existing, so
// fixed, valid dummy values are set here before any test module (and
// therefore env.ts) is imported.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/sentinel_test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters-long";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-characters-long";
process.env.CORS_ORIGIN = "http://localhost:5173";
