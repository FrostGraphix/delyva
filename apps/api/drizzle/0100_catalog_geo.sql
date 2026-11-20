CREATE TABLE "branch_opening_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" text NOT NULL,
	"closes_at" text NOT NULL,
	CONSTRAINT "boh_day_chk" CHECK ("branch_opening_hours"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "boh_opens_chk" CHECK ("branch_opening_hours"."opens_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "boh_closes_chk" CHECK ("branch_opening_hours"."closes_at" ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$')
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"zone_id" uuid NOT NULL,
	"prep_minutes" integer DEFAULT 15 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_prep_chk" CHECK ("branches"."prep_minutes" BETWEEN 0 AND 240)
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_price_chk" CHECK ("menu_items"."price_minor" >= 0),
	CONSTRAINT "menu_items_currency_chk" CHECK ("menu_items"."currency" = 'NGN')
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_select" integer NOT NULL,
	"max_select" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "modifier_groups_bounds_chk" CHECK ("modifier_groups"."min_select" >= 0 AND "modifier_groups"."max_select" >= 1 AND "modifier_groups"."min_select" <= "modifier_groups"."max_select")
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_delta_minor" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "modifier_options_price_chk" CHECK ("modifier_options"."price_delta_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_members" (
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_members_vendor_id_user_id_pk" PRIMARY KEY("vendor_id","user_id"),
	CONSTRAINT "vendor_members_role_chk" CHECK ("vendor_members"."role" IN ('owner','staff'))
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_category_chk" CHECK ("vendors"."category" IN ('restaurant','grocery','pharmacy','bakery','shop')),
	CONSTRAINT "vendors_status_chk" CHECK ("vendors"."status" IN ('draft','in_review','live','suspended'))
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"line1" text NOT NULL,
	"landmark" text,
	"location" geometry(Point,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"name" text NOT NULL,
	"boundary" geometry(Polygon,4326) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branch_opening_hours" ADD CONSTRAINT "branch_opening_hours_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branch_opening_hours_branch_idx" ON "branch_opening_hours" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "branches_zone_idx" ON "branches" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "branches_vendor_idx" ON "branches" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "branches_location_gix" ON "branches" USING gist ("location");--> statement-breakpoint
CREATE INDEX "menu_categories_vendor_idx" ON "menu_categories" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "menu_items_vendor_idx" ON "menu_items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "modifier_groups_item_idx" ON "modifier_groups" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "modifier_options_group_idx" ON "modifier_options" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "vendor_members_user_idx" ON "vendor_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vendors_status_category_idx" ON "vendors" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_zones_boundary_gix" ON "delivery_zones" USING gist ("boundary");