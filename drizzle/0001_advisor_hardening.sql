-- Advisor hardening: index every foreign-key column that wasn't already
-- indexed (Supabase performance advisor 0001_unindexed_foreign_keys).
-- Already applied to the live project via the Supabase MCP migration
-- "advisor_hardening"; IF NOT EXISTS keeps re-runs safe.
CREATE INDEX IF NOT EXISTS "budgets_category_idx" ON "budgets" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_account_idx" ON "expenses" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_contrib_user_idx" ON "goal_contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "income_account_idx" ON "income" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "income_category_idx" ON "income" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loan_payments_user_idx" ON "loan_payments" USING btree ("user_id");
