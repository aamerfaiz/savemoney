CREATE TYPE "private"."mcp_token_scope" AS ENUM('read_summary', 'read_full');--> statement-breakpoint
CREATE TABLE "private"."mcp_agent_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"wrapped_dek_by_token" text NOT NULL,
	"token_dek_iv" text NOT NULL,
	"scope" "private"."mcp_token_scope" DEFAULT 'read_summary' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "mcp_agent_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "private"."vault_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wrapped_dek_by_password" text NOT NULL,
	"password_dek_iv" text NOT NULL,
	"password_kek_salt" text NOT NULL,
	"password_kdf_params" jsonb NOT NULL,
	"wrapped_dek_by_recovery" text NOT NULL,
	"recovery_dek_iv" text NOT NULL,
	"recovery_kek_salt" text NOT NULL,
	"recovery_acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vault_keys_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "private"."mcp_agent_tokens" ADD CONSTRAINT "mcp_agent_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."vault_keys" ADD CONSTRAINT "vault_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_agent_tokens_user_idx" ON "private"."mcp_agent_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_agent_tokens_token_hash_idx" ON "private"."mcp_agent_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "vault_keys_user_idx" ON "private"."vault_keys" USING btree ("user_id");