import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes SQL migrations from src/db/schema.ts into ./drizzle.
// The API applies them on start-up (embedded Postgres and Postgres server alike).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
});
