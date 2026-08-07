CREATE TABLE "collection_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"paid_by_participant_id" uuid,
	"spent_at" date NOT NULL,
	"linked_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collection_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"linked_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "collections" DROP CONSTRAINT "collections_payout_expense_id_expenses_id_fk";
--> statement-breakpoint
DROP INDEX "collections_payout_expense_idx";--> statement-breakpoint
ALTER TABLE "collection_contributions" ALTER COLUMN "contributor_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_contributions" ADD COLUMN "participant_id" uuid;--> statement-breakpoint
ALTER TABLE "collection_expenses" ADD CONSTRAINT "collection_expenses_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expenses" ADD CONSTRAINT "collection_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expenses" ADD CONSTRAINT "collection_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expenses" ADD CONSTRAINT "collection_expenses_paid_by_participant_id_collection_participants_id_fk" FOREIGN KEY ("paid_by_participant_id") REFERENCES "public"."collection_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_expenses" ADD CONSTRAINT "collection_expenses_linked_transaction_id_expenses_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_participants" ADD CONSTRAINT "collection_participants_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_participants" ADD CONSTRAINT "collection_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_participants" ADD CONSTRAINT "collection_participants_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_expenses_collection_idx" ON "collection_expenses" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_expenses_user_idx" ON "collection_expenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_expenses_category_idx" ON "collection_expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "collection_expenses_linked_txn_idx" ON "collection_expenses" USING btree ("linked_transaction_id");--> statement-breakpoint
CREATE INDEX "collection_participants_collection_idx" ON "collection_participants" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_participants_user_idx" ON "collection_participants" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "collection_contributions" ADD CONSTRAINT "collection_contributions_participant_id_collection_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."collection_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_contrib_participant_idx" ON "collection_contributions" USING btree ("participant_id");--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "payout_amount";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "payout_at";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "payout_note";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "payout_expense_id";