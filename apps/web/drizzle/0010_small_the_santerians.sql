ALTER TABLE "goals" ALTER COLUMN "target_amount" SET DATA TYPE text USING target_amount::text;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "current_amount" SET DATA TYPE text USING current_amount::text;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "current_amount" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "monthly_contribution" SET DATA TYPE text USING monthly_contribution::text;
