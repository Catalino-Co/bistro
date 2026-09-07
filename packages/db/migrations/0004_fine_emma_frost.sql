CREATE TABLE IF NOT EXISTS "bistro"."audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"action_key" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before_data" jsonb,
	"after_data" jsonb,
	"user_id" bigint,
	"branch_id" bigint,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "bistro"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."audit_log" ADD CONSTRAINT "audit_log_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "bistro"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_key_created_at_idx" ON "bistro"."audit_log" USING btree ("action_key","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_type_entity_id_idx" ON "bistro"."audit_log" USING btree ("entity_type","entity_id");