-- Workers can discover/claim only unresolved intents; tenant business rows still require a fenced lease.
CREATE POLICY worker_pending_read ON pactum."FinancialOperation" FOR SELECT TO pactum_worker USING(status IN('SUBMITTING','UNCERTAIN'));
CREATE POLICY worker_expired_claim ON pactum."FinancialOperation" FOR UPDATE TO pactum_worker USING(status IN('SUBMITTING','UNCERTAIN') AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt"<=now())) WITH CHECK(status IN('SUBMITTING','UNCERTAIN') AND "leaseExpiresAt">now());
ALTER TABLE pactum."FinancialOperation" ADD CONSTRAINT operation_kind CHECK(kind IN('CREATE_ORDER','AUTHORIZE','CAPTURE','CREATE_INVOICE'));
ALTER TABLE pactum."FinancialOperation" ADD CONSTRAINT operation_money CHECK("amountMinor">0 AND "amountMinor"<=9007199254740991 AND currency IN('USD','EUR','GBP'));
ALTER TABLE pactum."Settlement" ADD CONSTRAINT settlement_safe_money CHECK("amountMinor"<=9007199254740991);
ALTER TABLE pactum."WebhookEvent" ADD CONSTRAINT webhook_sandbox CHECK(provider='PAYPAL' AND environment='SANDBOX');
CREATE FUNCTION pactum.protect_webhook() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','leaseToken','leaseExpiresAt','processedAt','updatedAt','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','leaseToken','leaseExpiresAt','processedAt','updatedAt','version']) THEN RAISE EXCEPTION 'Verified webhook identity and payload are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN('PROCESSED','QUARANTINED') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Completed event cannot be reclaimed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER webhook_identity BEFORE UPDATE ON pactum."WebhookEvent" FOR EACH ROW EXECUTE FUNCTION pactum.protect_webhook();

CREATE OR REPLACE FUNCTION pactum.protect_pending_finance() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pactum."FinancialOperation" WHERE "sessionId"=OLD.id AND "organizationId"=OLD."organizationId" AND status IN('INTENT_RECORDED','SUBMITTING','UNCERTAIN')) AND (
   (NEW.status IN('CANCELLED','MANDATE_PENDING','NEGOTIATING','DISPUTED') AND NEW.status<>OLD.status)
   OR (convert_from(NEW.snapshot,'UTF8')::jsonb->'mandate') IS DISTINCT FROM (convert_from(OLD.snapshot,'UTF8')::jsonb->'mandate')
   OR (convert_from(NEW.snapshot,'UTF8')::jsonb->'agreementRecord') IS DISTINCT FROM (convert_from(OLD.snapshot,'UTF8')::jsonb->'agreementRecord')
 ) THEN RAISE EXCEPTION 'Pending financial intent must be reconciled before contractual changes' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

DROP POLICY tenant_access ON pactum."ProcurementSession";
CREATE POLICY tenant_read ON pactum."ProcurementSession" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."ProcurementSession" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER'));
CREATE POLICY tenant_update ON pactum."ProcurementSession" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER'));

DROP POLICY tenant_access ON pactum."MandateRevision";
CREATE POLICY tenant_read ON pactum."MandateRevision" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."MandateRevision" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER'));
CREATE POLICY tenant_update ON pactum."MandateRevision" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER'));

DROP POLICY tenant_access ON pactum."Agreement";
CREATE POLICY tenant_read ON pactum."Agreement" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."Agreement" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER'));
CREATE POLICY tenant_update ON pactum."Agreement" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER'));

DROP POLICY tenant_access ON pactum."FxCommitment";
CREATE POLICY tenant_read ON pactum."FxCommitment" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."FxCommitment" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER'));
CREATE POLICY tenant_update ON pactum."FxCommitment" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER'));

DROP POLICY tenant_access ON pactum."FinancialOperation";
CREATE POLICY tenant_read ON pactum."FinancialOperation" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."FinancialOperation" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER'));
CREATE POLICY tenant_update ON pactum."FinancialOperation" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER'));

DROP POLICY tenant_access ON pactum."Settlement";
CREATE POLICY tenant_read ON pactum."Settlement" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."Settlement" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER'));
CREATE POLICY tenant_update ON pactum."Settlement" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER'));

DROP POLICY tenant_access ON pactum."Dispute";
CREATE POLICY tenant_read ON pactum."Dispute" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."Dispute" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','PROCUREMENT_MANAGER','FINANCE_MANAGER'));
CREATE POLICY tenant_update ON pactum."Dispute" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','PROCUREMENT_MANAGER','FINANCE_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','PROCUREMENT_MANAGER','FINANCE_MANAGER'));

DROP POLICY tenant_access ON pactum."EvidenceRecord";
CREATE POLICY tenant_read ON pactum."EvidenceRecord" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."EvidenceRecord" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER'));
CREATE POLICY tenant_update ON pactum."EvidenceRecord" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER'));

DROP POLICY tenant_access ON pactum."IdempotencyRecord";
CREATE POLICY tenant_read ON pactum."IdempotencyRecord" FOR SELECT TO pactum_runtime USING(pactum.tenant_scope("organizationId"));
CREATE POLICY tenant_insert ON pactum."IdempotencyRecord" FOR INSERT TO pactum_runtime WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER'));
CREATE POLICY tenant_update ON pactum."IdempotencyRecord" FOR UPDATE TO pactum_runtime USING(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER')) WITH CHECK(pactum.tenant_scope("organizationId") AND pactum.member_role("organizationId") IN('OWNER','ADMIN','PROCUREMENT_MANAGER','FINANCE_MANAGER'));

CREATE FUNCTION pactum.operational_health() RETURNS TABLE(status text, total bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.status::text,count(*) FROM pactum."ProcurementSession" p GROUP BY p.status;
$$;
GRANT CREATE ON SCHEMA pactum TO pactum_policy_reader;
ALTER FUNCTION pactum.operational_health() OWNER TO pactum_policy_reader;
REVOKE CREATE ON SCHEMA pactum FROM pactum_policy_reader;
REVOKE ALL ON FUNCTION pactum.operational_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pactum.operational_health() TO pactum_worker;

-- Resolve only previously persisted provider identities, never caller SESSION metadata.
CREATE OR REPLACE FUNCTION pactum.resolve_order(order_id text, merchant text) RETURNS TABLE("organizationId" uuid,"sessionPublicId" text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT DISTINCT s."organizationId",p."publicId" FROM pactum."Settlement" s JOIN pactum."ProcurementSession" p ON p.id=s."sessionId" AND p."organizationId"=s."organizationId"
 WHERE s."merchantId"=merchant AND s.environment='SANDBOX' AND (s."orderId"=order_id OR s."authorizationId"=order_id OR s."captureId"=order_id OR EXISTS(SELECT 1 FROM pactum."FinancialOperation" o WHERE o."organizationId"=s."organizationId" AND o."sessionId"=s."sessionId" AND o."merchantId"=merchant AND o.environment='SANDBOX' AND o.status='SUCCEEDED' AND o."providerResourceId"=order_id));
$$;

REVOKE UPDATE ON pactum."User" FROM pactum_runtime;
CREATE FUNCTION pactum.protect_membership_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW."organizationId"<>OLD."organizationId" OR NEW."userId"<>OLD."userId" THEN RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER membership_identity BEFORE UPDATE ON pactum."OrganizationMembership" FOR EACH ROW EXECUTE FUNCTION pactum.protect_membership_identity();
CREATE FUNCTION pactum.protect_confirmed_operation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.status='SUCCEEDED' AND (NEW.response IS DISTINCT FROM OLD.response OR NEW."providerResourceId" IS DISTINCT FROM OLD."providerResourceId") THEN RAISE EXCEPTION 'Confirmed provider response is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER confirmed_operation BEFORE UPDATE ON pactum."FinancialOperation" FOR EACH ROW EXECUTE FUNCTION pactum.protect_confirmed_operation();
CREATE FUNCTION pactum.protect_fx_quote_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.status='QUOTED' AND NEW.status NOT IN('QUOTED','LOCKED','EXPIRED') THEN RAISE EXCEPTION 'Quote must be locked before consumption' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fx_quote_transition BEFORE UPDATE ON pactum."FxCommitment" FOR EACH ROW EXECUTE FUNCTION pactum.protect_fx_quote_transition();
ALTER TABLE pactum."ProcurementSession" ADD CONSTRAINT snapshot_status_matches CHECK(convert_from(snapshot,'UTF8')::jsonb->>'status'=status::text);
