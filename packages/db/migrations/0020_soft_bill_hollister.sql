ALTER TABLE "bistro"."customers" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "bistro"."customers" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "bistro"."customers" ADD COLUMN "archived_at" timestamp with time zone;