CREATE SCHEMA IF NOT EXISTS "private";--> statement-breakpoint
CREATE TYPE "private"."ai_provider" AS ENUM('deepseek', 'openai', 'gemini', 'claude');--> statement-breakpoint
CREATE TABLE "private"."ai_provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "private"."ai_provider" NOT NULL,
	"label" text,
	"encrypted_key" text NOT NULL,
	"key_iv" text NOT NULL,
	"key_last4" text NOT NULL,
	"model" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "private"."ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_provider_keys_user_idx" ON "private"."ai_provider_keys" USING btree ("user_id");