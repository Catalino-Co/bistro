CREATE TABLE IF NOT EXISTS "bistro"."kitchen_stations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bistro"."kitchen_stations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"status" "bistro"."status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "kitchen_stations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "bistro"."items" ADD COLUMN "station_id" bigint;--> statement-breakpoint
ALTER TABLE "bistro"."order_lines" ADD COLUMN "sent_to_kitchen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bistro"."order_lines" ADD COLUMN "prepared_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bistro"."items" ADD CONSTRAINT "items_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "bistro"."kitchen_stations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
