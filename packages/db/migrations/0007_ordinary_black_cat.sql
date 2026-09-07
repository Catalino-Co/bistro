CREATE TYPE "bistro"."dine_table_status" AS ENUM('available', 'occupied', 'reserved');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bistro"."dine_areas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."dine_areas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" bigint NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bistro"."dining_tables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."dining_tables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"dine_area_id" bigint NOT NULL,
	"name" text NOT NULL,
	"seats" integer DEFAULT 2 NOT NULL,
	"status" "bistro"."dine_table_status" DEFAULT 'available' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."dine_areas" ADD CONSTRAINT "dine_areas_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "bistro"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."dining_tables" ADD CONSTRAINT "dining_tables_dine_area_id_dine_areas_id_fk" FOREIGN KEY ("dine_area_id") REFERENCES "bistro"."dine_areas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
