ALTER TABLE "loan_payments" ALTER COLUMN "amount" SET DATA TYPE text USING amount::text;--> statement-breakpoint
ALTER TABLE "loan_payments" ALTER COLUMN "principal_component" SET DATA TYPE text USING principal_component::text;--> statement-breakpoint
ALTER TABLE "loan_payments" ALTER COLUMN "interest_component" SET DATA TYPE text USING interest_component::text;
