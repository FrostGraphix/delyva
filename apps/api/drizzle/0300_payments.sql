CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"owner_id" text,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_nonzero" CHECK ("ledger_entries"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reference" text NOT NULL,
	"reverses_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"order_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"reference" text NOT NULL,
	"authorization_url" text,
	"failure_reason" text,
	"provider_transaction_id" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payment_intents_amount_positive" CHECK ("payment_intents"."amount_minor" > 0),
	CONSTRAINT "payment_intents_status_valid" CHECK ("payment_intents"."status" IN ('requires_action','processing','succeeded','failed','refunded'))
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"destination" text NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"provider_refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_amount_positive" CHECK ("payment_refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "payout_recipients" (
	"account" text PRIMARY KEY NOT NULL,
	"recipient_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"account" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"reference" text NOT NULL,
	"status" text NOT NULL,
	"transfer_code" text,
	"last_error" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_holds_amount_positive" CHECK ("wallet_holds"."amount_minor" > 0),
	CONSTRAINT "wallet_holds_status_valid" CHECK ("wallet_holds"."status" IN ('active','captured','released'))
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_currency_uq" ON "ledger_accounts" USING btree ("code","currency");--> statement-breakpoint
CREATE INDEX "ledger_accounts_type_idx" ON "ledger_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_reference_idx" ON "ledger_transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payment_intents_user_idx" ON "payment_intents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_open_order_uq" ON "payment_intents" USING btree ("order_id") WHERE "payment_intents"."order_id" IS NOT NULL AND "payment_intents"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "payment_refunds_order_idx" ON "payment_refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payouts_batch_idx" ON "payouts" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_holds_reference_uq" ON "wallet_holds" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "wallet_holds_user_active_idx" ON "wallet_holds" USING btree ("user_id") WHERE "wallet_holds"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_uq" ON "payment_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
-- Ledger invariants enforced by the database (ADR 0300). Hand-written below this line.
CREATE FUNCTION ledger_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % on % is forbidden', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_transactions_append_only BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON "ledger_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_mutation();--> statement-breakpoint
CREATE FUNCTION ledger_entry_currency_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ledger_accounts a WHERE a.id = NEW.account_id AND a.currency = NEW.currency) THEN
    RAISE EXCEPTION 'ledger entry currency % does not match its account', NEW.currency
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_currency BEFORE INSERT ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_currency_matches();--> statement-breakpoint
-- Checked at COMMIT: every transaction has >= 2 entries and sums to zero per currency.
CREATE FUNCTION ledger_assert_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  txn uuid;
  n integer;
  bad text;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN txn := NEW.id; ELSE txn := NEW.transaction_id; END IF;
  SELECT count(*) INTO n FROM ledger_entries WHERE transaction_id = txn;
  IF n < 2 THEN
    RAISE EXCEPTION 'ledger transaction % has % entries; at least 2 required', txn, n
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT string_agg(currency || '=' || s::text, ',') INTO bad FROM (
    SELECT currency, sum(amount_minor) AS s FROM ledger_entries
    WHERE transaction_id = txn GROUP BY currency HAVING sum(amount_minor) <> 0
  ) x;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced: %', txn, bad
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_assert_balanced();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_transactions_balanced AFTER INSERT ON "ledger_transactions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_assert_balanced();--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "ledger_entries", "ledger_transactions" FROM PUBLIC;