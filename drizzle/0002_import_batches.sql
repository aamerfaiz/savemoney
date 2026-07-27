CREATE TYPE "public"."import_source" AS ENUM('csv', 'sms', 'email', 'bank', 'manual');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('completed', 'rolled_back');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "import_source" DEFAULT 'csv' NOT NULL,
	"filename" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"status" "import_status" DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_user_idx" ON "import_batches" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_import_batch_idx" ON "expenses" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "income_import_batch_idx" ON "income" USING btree ("import_batch_id");