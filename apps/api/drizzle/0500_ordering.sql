CREATE TABLE "cart_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"option_ids" jsonb NOT NULL,
	"quantity" smallint NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "cart_lines_qty_chk" CHECK ("cart_lines"."quantity" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" smallint NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"options" jsonb NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ordering_event_receipts" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"vendor_name" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" text NOT NULL,
	"payment_method" text NOT NULL,
	"payment_intent_id" uuid,
	"payment_authorization_url" text,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"items_subtotal_minor" bigint NOT NULL,
	"delivery_fee_minor" bigint NOT NULL,
	"surge_fee_minor" bigint NOT NULL,
	"small_order_fee_minor" bigint NOT NULL,
	"service_fee_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"promo_code" text,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"dropoff_lat" double precision NOT NULL,
	"dropoff_lng" double precision NOT NULL,
	"prep_minutes" smallint,
	"ready_at" timestamp with time zone,
	"eta_minutes" smallint NOT NULL,
	"rider_id" uuid,
	"delivery_otp_hash" text NOT NULL,
	"pickup_code_hash" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_chk" CHECK ("orders"."total_minor" = "orders"."items_subtotal_minor" + "orders"."delivery_fee_minor" + "orders"."surge_fee_minor" + "orders"."small_order_fee_minor" + "orders"."service_fee_minor" + "orders"."vat_minor" - "orders"."discount_minor" AND "orders"."total_minor" > 0),
	CONSTRAINT "orders_method_chk" CHECK ("orders"."payment_method" IN ('card','transfer','wallet'))
);
--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_lines_cart_idx" ON "cart_lines" USING btree ("cart_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_user_branch_uq" ON "carts" USING btree ("user_id","branch_id");--> statement-breakpoint
CREATE INDEX "carts_user_idx" ON "carts" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_customer_idem_uq" ON "orders" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_vendor_idx" ON "orders" USING btree ("vendor_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_rider_idx" ON "orders" USING btree ("rider_id");