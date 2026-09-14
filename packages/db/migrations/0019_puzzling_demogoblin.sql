ALTER TABLE "bistro"."categories" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bistro"."families" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bistro"."subfamilies" ADD COLUMN "archived_at" timestamp with time zone;