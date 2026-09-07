CREATE TYPE "bistro"."modifier_selection_type" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bistro"."item_modifier_groups" (
	"item_id" bigint NOT NULL,
	"modifier_group_id" bigint NOT NULL,
	CONSTRAINT "item_modifier_groups_item_id_modifier_group_id_pk" PRIMARY KEY("item_id","modifier_group_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bistro"."modifier_groups" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."modifier_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"selection_type" "bistro"."modifier_selection_type" DEFAULT 'single' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bistro"."modifiers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."modifiers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"group_id" bigint NOT NULL,
	"name" text NOT NULL,
	"price_delta" numeric(12, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."item_modifier_groups" ADD CONSTRAINT "item_modifier_groups_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "bistro"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."item_modifier_groups" ADD CONSTRAINT "item_modifier_groups_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "bistro"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."modifiers" ADD CONSTRAINT "modifiers_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "bistro"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
