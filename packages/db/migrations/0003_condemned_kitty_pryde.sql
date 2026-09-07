CREATE TABLE IF NOT EXISTS "bistro"."login_attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."login_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"ip_address" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_username_attempted_at_idx" ON "bistro"."login_attempts" USING btree ("username","attempted_at");