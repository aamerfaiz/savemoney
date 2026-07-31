-- Phase 3.5.3 — encrypt income/expenses money + free-text columns.
-- drizzle-kit's generated SET DATA TYPE lacks a USING clause, which
-- Postgres requires for numeric->text and text[]->text (neither has an
-- implicit/assignment cast). Existing rows' plaintext values become
-- non-ciphertext strings after this — unreadable once the app expects a
-- packed iv:ciphertext blob, same accepted consequence as the Phase 3.5.2
-- AI-key migration (backfill is 3.5.7, not this pass).
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE text USING amount::text;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "tags" SET DATA TYPE text USING array_to_string(tags, ',');--> statement-breakpoint
ALTER TABLE "income" ALTER COLUMN "amount" SET DATA TYPE text USING amount::text;
