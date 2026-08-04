import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase manages the `auth` schema — don't let drizzle touch it.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
