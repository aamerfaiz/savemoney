CREATE TYPE "public"."collection_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "collection_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contributor_name" text NOT NULL,
	"amount" text NOT NULL,
	"contributed_at" date NOT NULL,
	"method" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"purpose" text,
	"icon" text,
	"target_amount" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"event_date" date,
	"status" "collection_status" DEFAULT 'open' NOT NULL,
	"payout_amount" text,
	"payout_at" date,
	"payout_note" text,
	"payout_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "collection_contributions" ADD CONSTRAINT "collection_contributions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_contributions" ADD CONSTRAINT "collection_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_payout_expense_id_expenses_id_fk" FOREIGN KEY ("payout_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_contrib_collection_idx" ON "collection_contributions" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_contrib_user_idx" ON "collection_contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "collections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collections_payout_expense_idx" ON "collections" USING btree ("payout_expense_id");