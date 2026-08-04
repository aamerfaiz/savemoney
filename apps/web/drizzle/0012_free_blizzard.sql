ALTER TABLE "investments" ALTER COLUMN "invested_amount" SET DATA TYPE text USING invested_amount::text;--> statement-breakpoint
ALTER TABLE "investments" ALTER COLUMN "current_value" SET DATA TYPE text USING current_value::text;--> statement-breakpoint
ALTER TABLE "investments" ALTER COLUMN "monthly_contribution" SET DATA TYPE text USING monthly_contribution::text;
