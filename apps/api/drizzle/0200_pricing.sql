CREATE TABLE "fee_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_code" text NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"base_fee_minor" bigint NOT NULL,
	"base_distance_meters" integer NOT NULL,
	"tiers" jsonb NOT NULL,
	"min_fee_minor" bigint NOT NULL,
	"max_fee_minor" bigint NOT NULL,
	"max_distance_meters" integer NOT NULL,
	"small_order_threshold_minor" bigint NOT NULL,
	"small_order_fee_minor" bigint NOT NULL,
	"service_fee_bps" integer NOT NULL,
	"service_fee_cap_minor" bigint NOT NULL,
	"vat_bps" integer NOT NULL,
	"max_surge_bps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_rules_zone_code_unique" UNIQUE("zone_code"),
	CONSTRAINT "fee_rules_min_le_max" CHECK ("fee_rules"."min_fee_minor" <= "fee_rules"."max_fee_minor"),
	CONSTRAINT "fee_rules_surge_cap" CHECK ("fee_rules"."max_surge_bps" >= 10000)
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"promo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_redemptions_promo_order_uq" UNIQUE("promo_id","order_id"),
	CONSTRAINT "promo_redemptions_discount_nonneg" CHECK ("promo_redemptions"."discount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value_minor" bigint,
	"percent_bps" integer,
	"max_discount_minor" bigint,
	"min_order_minor" bigint DEFAULT 0 NOT NULL,
	"audience" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active_days_of_week" integer[],
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"global_limit" integer,
	"budget_minor" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"spent_minor" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promos_code_unique" UNIQUE("code"),
	CONSTRAINT "promos_window" CHECK ("promos"."starts_at" < "promos"."ends_at"),
	CONSTRAINT "promos_budget" CHECK ("promos"."budget_minor" IS NULL OR "promos"."spent_minor" <= "promos"."budget_minor"),
	CONSTRAINT "promos_global_limit" CHECK ("promos"."global_limit" IS NULL OR "promos"."redemption_count" <= "promos"."global_limit")
);
--> statement-breakpoint
CREATE TABLE "surge_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_code" text NOT NULL,
	"days_of_week" integer[] NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"multiplier_bps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surge_rules_window" CHECK ("surge_rules"."start_minute" < "surge_rules"."end_minute" AND "surge_rules"."end_minute" <= 1440),
	CONSTRAINT "surge_rules_multiplier" CHECK ("surge_rules"."multiplier_bps" >= 10000)
);
--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_redemptions_user_idx" ON "promo_redemptions" USING btree ("user_id","promo_id");--> statement-breakpoint
CREATE INDEX "surge_rules_zone_idx" ON "surge_rules" USING btree ("zone_code");