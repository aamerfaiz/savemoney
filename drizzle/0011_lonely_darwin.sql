ALTER TABLE "loans" ALTER COLUMN "principal" SET DATA TYPE text USING principal::text;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "emi" SET DATA TYPE text USING emi::text;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "emi" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "remaining_amount" SET DATA TYPE text USING remaining_amount::text;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "extra_emi" SET DATA TYPE text USING extra_emi::text;
