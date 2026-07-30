CREATE TABLE "net_worth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"captured_at" date NOT NULL,
	"total_assets" numeric(14, 2) NOT NULL,
	"total_liabilities" numeric(14, 2) NOT NULL,
	"net_worth" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "net_worth_snapshots_user_idx" ON "net_worth_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "net_worth_snapshots_captured_idx" ON "net_worth_snapshots" USING btree ("captured_at");