ALTER TABLE "net_worth_snapshots" ALTER COLUMN "total_assets" SET DATA TYPE text USING total_assets::text;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ALTER COLUMN "total_liabilities" SET DATA TYPE text USING total_liabilities::text;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ALTER COLUMN "net_worth" SET DATA TYPE text USING net_worth::text;
