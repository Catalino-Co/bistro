CREATE TABLE IF NOT EXISTS "bistro"."customer_types" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."customer_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"allows_room_service" boolean DEFAULT false NOT NULL,
	CONSTRAINT "customer_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bistro"."tax_rates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."tax_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"rate" numeric(6, 4) NOT NULL,
	"status" "bistro"."status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rates_name_unique" UNIQUE("name")
);
