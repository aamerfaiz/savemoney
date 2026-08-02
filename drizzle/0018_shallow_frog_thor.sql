CREATE TABLE "private"."mcp_tool_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"action" text NOT NULL,
	"target_table" text,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private"."mcp_agent_tokens" ADD COLUMN "can_write" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "private"."mcp_tool_call_log" ADD CONSTRAINT "mcp_tool_call_log_token_id_mcp_agent_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "private"."mcp_agent_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."mcp_tool_call_log" ADD CONSTRAINT "mcp_tool_call_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_tool_call_log_token_idx" ON "private"."mcp_tool_call_log" USING btree ("token_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_tool_call_log_user_idx" ON "private"."mcp_tool_call_log" USING btree ("user_id");