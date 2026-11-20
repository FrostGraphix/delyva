CREATE TABLE "dispatch_event_receipts" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"status" text NOT NULL,
	"radius_m" integer NOT NULL,
	"distance_m" integer NOT NULL,
	"eta_seconds" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_offers_status_ck" CHECK ("dispatch_offers"."status" IN ('pending', 'accepted', 'declined', 'expired', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "dispatch_requests" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"dropoff_lat" double precision NOT NULL,
	"dropoff_lng" double precision NOT NULL,
	"prep_minutes" integer NOT NULL,
	"ready_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"radius_step" integer DEFAULT 0 NOT NULL,
	"declines" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_requests_status_ck" CHECK ("dispatch_requests"."status" IN ('scheduled', 'searching', 'assigned', 'unassigned'))
);
--> statement-breakpoint
CREATE TABLE "rider_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"vehicle_plate" text,
	"hub" text,
	"battery_pct" smallint,
	"status" text DEFAULT 'offline' NOT NULL,
	"offers_received" integer DEFAULT 0 NOT NULL,
	"offers_accepted" integer DEFAULT 0 NOT NULL,
	"offers_declined" integer DEFAULT 0 NOT NULL,
	"offers_expired" integer DEFAULT 0 NOT NULL,
	"rating_x100" integer DEFAULT 500 NOT NULL,
	"last_job_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rider_profiles_status_ck" CHECK ("rider_profiles"."status" IN ('offline', 'online', 'on_trip')),
	CONSTRAINT "rider_profiles_battery_ck" CHECK ("rider_profiles"."battery_pct" BETWEEN 0 AND 100),
	CONSTRAINT "rider_profiles_rating_ck" CHECK ("rider_profiles"."rating_x100" BETWEEN 0 AND 500),
	CONSTRAINT "rider_profiles_plate_ck" CHECK ("rider_profiles"."vehicle_plate" ~ '^[A-Z]{3}-[0-9]{3}-[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"offer_id" uuid,
	"status" text NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"dropoff_lat" double precision NOT NULL,
	"dropoff_lng" double precision NOT NULL,
	"assignment" text NOT NULL,
	"assigned_by" uuid,
	"assignment_reason" text,
	"undeliverable_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_status_ck" CHECK ("trips"."status" IN ('assigned', 'at_vendor', 'picked_up', 'at_customer', 'delivered', 'undeliverable')),
	CONSTRAINT "trips_assignment_ck" CHECK ("trips"."assignment" IN ('offer', 'manual')),
	CONSTRAINT "trips_manual_reason_ck" CHECK ("trips"."assignment" = 'offer' OR ("trips"."assigned_by" IS NOT NULL AND "trips"."assignment_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_offers_pending_order_uq" ON "dispatch_offers" USING btree ("order_id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_offers_pending_rider_uq" ON "dispatch_offers" USING btree ("rider_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "dispatch_offers_order_idx" ON "dispatch_offers" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "dispatch_requests_status_idx" ON "dispatch_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rider_profiles_status_idx" ON "rider_profiles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_active_order_uq" ON "trips" USING btree ("order_id") WHERE status IN ('assigned', 'at_vendor', 'picked_up', 'at_customer');--> statement-breakpoint
CREATE UNIQUE INDEX "trips_active_rider_uq" ON "trips" USING btree ("rider_id") WHERE status IN ('assigned', 'at_vendor', 'picked_up', 'at_customer');--> statement-breakpoint
CREATE INDEX "trips_rider_status_idx" ON "trips" USING btree ("rider_id","status");