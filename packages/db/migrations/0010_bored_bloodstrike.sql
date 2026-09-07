CREATE TYPE "bistro"."order_dispatch_mode" AS ENUM('dine_in', 'delivery', 'pickup', 'room_service');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bistro"."customers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_type_id" bigint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bistro"."orders" ADD COLUMN "dispatch_mode" "bistro"."order_dispatch_mode" DEFAULT 'dine_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "bistro"."orders" ADD COLUMN "customer_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."customers" ADD CONSTRAINT "customers_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "bistro"."customer_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "bistro"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
