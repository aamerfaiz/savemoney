CREATE TYPE "public"."collection_type" AS ENUM('pool', 'trip');--> statement-breakpoint
CREATE TABLE "collection_expense_payers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"amount" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collection_expense_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"share_amount" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collection_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"from_contributor_id" uuid NOT NULL,
	"to_contributor_id" uuid NOT NULL,
	"amount" text NOT NULL,
	"settled_at" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "type" "collection_type" DEFAULT 'pool' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_expense_payers" ADD CONSTRAINT "collection_expense_payers_expense_id_collection_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."collection_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expense_payers" ADD CONSTRAINT "collection_expense_payers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expense_payers" ADD CONSTRAINT "collection_expense_payers_contributor_id_collection_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."collection_contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expense_splits" ADD CONSTRAINT "collection_expense_splits_expense_id_collection_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."collection_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expense_splits" ADD CONSTRAINT "collection_expense_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expense_splits" ADD CONSTRAINT "collection_expense_splits_contributor_id_collection_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."collection_contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_settlements" ADD CONSTRAINT "collection_settlements_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_settlements" ADD CONSTRAINT "collection_settlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_settlements" ADD CONSTRAINT "collection_settlements_from_contributor_id_collection_contributors_id_fk" FOREIGN KEY ("from_contributor_id") REFERENCES "public"."collection_contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_settlements" ADD CONSTRAINT "collection_settlements_to_contributor_id_collection_contributors_id_fk" FOREIGN KEY ("to_contributor_id") REFERENCES "public"."collection_contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_expense_payers_expense_idx" ON "collection_expense_payers" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "collection_expense_payers_user_idx" ON "collection_expense_payers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_expense_payers_contributor_idx" ON "collection_expense_payers" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "collection_expense_splits_expense_idx" ON "collection_expense_splits" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "collection_expense_splits_user_idx" ON "collection_expense_splits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_expense_splits_contributor_idx" ON "collection_expense_splits" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "collection_settlements_collection_idx" ON "collection_settlements" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_settlements_user_idx" ON "collection_settlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_settlements_from_idx" ON "collection_settlements" USING btree ("from_contributor_id");--> statement-breakpoint
CREATE INDEX "collection_settlements_to_idx" ON "collection_settlements" USING btree ("to_contributor_id");