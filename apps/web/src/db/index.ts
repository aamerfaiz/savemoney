import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Server-side Drizzle client backed by the Supabase Postgres connection.
 * Use the pooled connection string (Supabase "Transaction" pooler, port 6543)
 * in serverless/Vercel environments.
 *
 * This is for trusted server code (migrations, admin tasks, jobs). Regular
 * request-path data access should go through Supabase with RLS enforced.
 */
const connectionString = process.env.DATABASE_URL;

const client = connectionString
  ? postgres(connectionString, { prepare: false })
  : undefined;

export const db = client
  ? drizzle(client, { schema })
  : (undefined as unknown as ReturnType<typeof drizzle>);

export { schema };
