ALTER TABLE "bistro"."orders" ADD COLUMN "subtotal" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "bistro"."orders" ADD COLUMN "tax_total" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "bistro"."orders" ADD COLUMN "total" numeric(12, 4);