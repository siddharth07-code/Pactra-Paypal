-- Bootstrap the restricted roles and Auth adapters with scripts/database/bootstrap.sql first.
DO $$ BEGIN
 IF to_regprocedure('pactum.verified_auth_session()') IS NULL OR to_regprocedure('pactum.install_auth_identity_fk()') IS NULL THEN
  RAISE EXCEPTION 'Run scripts/database/bootstrap.sql as the Auth-capable administrator before deploying';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('pactum_runtime','pactum_worker','pactum_policy_reader') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin)) THEN
  RAISE EXCEPTION 'PACTRA capability roles must be restricted NOLOGIN roles';
 END IF;
END $$;
GRANT USAGE ON SCHEMA pactum TO pactum_runtime, pactum_worker, pactum_policy_reader;
GRANT CREATE ON SCHEMA pactum TO pactum_policy_reader;
-- Bootstrap grants the migrator SET membership without role-administration privileges.
REVOKE ALL ON SCHEMA pactum FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA pactum FROM PUBLIC;
GRANT SELECT ON pactum."User",pactum."Organization",pactum."OrganizationMembership",pactum."OrganizationInvitation",pactum."ProcurementSession",pactum."FinancialOperation",pactum."WebhookEvent",pactum."Settlement" TO pactum_policy_reader;

CREATE FUNCTION pactum.auth_session_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pactum.verified_auth_session();
$$;
CREATE FUNCTION pactum.member_role(org uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT m.role::text FROM pactum."OrganizationMembership" m JOIN pactum."User" u ON u.id=m."userId"
 JOIN pactum."Organization" o ON o.id=m."organizationId"
 WHERE m."organizationId"=org AND u."authId"=NULLIF(current_setting('app.auth_user_id',true),'')::uuid
 AND m.status='ACTIVE' AND u."disabledAt" IS NULL AND o."suspendedAt" IS NULL AND pactum.auth_session_active();
$$;
CREATE FUNCTION pactum.organization_empty(org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM pactum."OrganizationMembership" WHERE "organizationId"=org);
$$;
CREATE FUNCTION pactum.worker_scope(org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pg_has_role(session_user,'pactum_worker','member') AND (
 EXISTS(SELECT 1 FROM pactum."WebhookEvent" WHERE id=NULLIF(current_setting('app.job_id',true),'')::uuid
 AND "organizationId"=org AND status='PROCESSING' AND "leaseToken"=NULLIF(current_setting('app.lease_token',true),'')::uuid AND "leaseExpiresAt">now())
 OR EXISTS(SELECT 1 FROM pactum."FinancialOperation" WHERE id=NULLIF(current_setting('app.job_id',true),'')::uuid
 AND "organizationId"=org AND status IN('SUBMITTING','UNCERTAIN') AND "leaseToken"=NULLIF(current_setting('app.lease_token',true),'')::uuid AND "leaseExpiresAt">now()));
$$;
CREATE FUNCTION pactum.tenant_scope(org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT org=NULLIF(current_setting('app.organization_id',true),'')::uuid
 AND (pactum.member_role(org) IS NOT NULL OR pactum.worker_scope(org));
$$;
CREATE FUNCTION pactum.worker_session_scope(org uuid, session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pactum.tenant_scope(org) AND (
 EXISTS(SELECT 1 FROM pactum."FinancialOperation" o WHERE o.id=NULLIF(current_setting('app.job_id',true),'')::uuid AND o."organizationId"=org AND o."sessionId"=session)
 OR EXISTS(SELECT 1 FROM pactum."WebhookEvent" w JOIN pactum."ProcurementSession" p ON p."publicId"=w."sessionPublicId" AND p."organizationId"=w."organizationId"
 WHERE w.id=NULLIF(current_setting('app.job_id',true),'')::uuid AND w."organizationId"=org AND p.id=session));
$$;
ALTER FUNCTION pactum.auth_session_active() OWNER TO pactum_policy_reader;
ALTER FUNCTION pactum.member_role(uuid) OWNER TO pactum_policy_reader;
ALTER FUNCTION pactum.organization_empty(uuid) OWNER TO pactum_policy_reader;
ALTER FUNCTION pactum.worker_scope(uuid) OWNER TO pactum_policy_reader;
ALTER FUNCTION pactum.tenant_scope(uuid) OWNER TO pactum_policy_reader;
ALTER FUNCTION pactum.worker_session_scope(uuid,uuid) OWNER TO pactum_policy_reader;
REVOKE ALL ON FUNCTION pactum.auth_session_active(),pactum.member_role(uuid),pactum.organization_empty(uuid),pactum.worker_scope(uuid),pactum.tenant_scope(uuid),pactum.worker_session_scope(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pactum.auth_session_active(), pactum.member_role(uuid), pactum.organization_empty(uuid), pactum.worker_scope(uuid), pactum.tenant_scope(uuid) TO pactum_runtime, pactum_worker, pactum_policy_reader;
GRANT EXECUTE ON FUNCTION pactum.worker_session_scope(uuid,uuid) TO pactum_worker,pactum_policy_reader;

SELECT pactum.install_auth_identity_fk();
ALTER TABLE pactum."Organization" ADD CONSTRAINT org_creator_fk FOREIGN KEY("createdBy") REFERENCES pactum."User"(id) ON DELETE RESTRICT;
ALTER TABLE pactum."OrganizationInvitation" ADD CONSTRAINT inviter_fk FOREIGN KEY("invitedBy") REFERENCES pactum."User"(id) ON DELETE RESTRICT;
ALTER TABLE pactum."OrganizationInvitation" ADD CONSTRAINT accepter_fk FOREIGN KEY("acceptedBy") REFERENCES pactum."User"(id) ON DELETE RESTRICT;
ALTER TABLE pactum."Agreement" ADD CONSTRAINT mandate_revision_fk FOREIGN KEY("sessionId","organizationId","mandateRevision") REFERENCES pactum."MandateRevision"("sessionId","organizationId",revision) ON DELETE RESTRICT;
ALTER TABLE pactum."FxCommitment" ADD CONSTRAINT fx_agreement_fk FOREIGN KEY("agreementId","organizationId","sessionId") REFERENCES pactum."Agreement"(id,"organizationId","sessionId") ON DELETE RESTRICT;
ALTER TABLE pactum."FxCommitment" ADD CONSTRAINT fx_amounts CHECK("sourceAmountMinor">0 AND "targetAmountMinor">0 AND rate>0 AND "sourceCurrency"='INR' AND "targetCurrency"='USD' AND "expiresAt">"quotedAt");
ALTER TABLE pactum."Agreement" ADD CONSTRAINT exact_agreement_total CHECK("totalMinor"="unitPriceMinor"*quantity+"shippingMinor" AND quantity>0 AND "unitPriceMinor">0 AND "shippingMinor">=0);
ALTER TABLE pactum."MandateRevision" ADD CONSTRAINT mandate_amounts CHECK("budgetMinor">0 AND quantity>0);
ALTER TABLE pactum."FinancialOperation" ADD CONSTRAINT sandbox_only CHECK(environment='SANDBOX' AND provider='PAYPAL');
ALTER TABLE pactum."Settlement" ADD CONSTRAINT positive_settlement CHECK("amountMinor">0 AND environment='SANDBOX');
CREATE UNIQUE INDEX capture_authorization_once ON pactum."FinancialOperation"(provider,environment,"merchantId","authorizationId") WHERE kind='CAPTURE';
CREATE UNIQUE INDEX session_captured_once ON pactum."Settlement"("organizationId","sessionId") WHERE "captureId" IS NOT NULL;

CREATE FUNCTION pactum.protect_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 BEGIN RAISE EXCEPTION 'Committed records are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON pactum."EvidenceRecord" FOR EACH ROW EXECUTE FUNCTION pactum.protect_immutable();
CREATE TRIGGER immutable_agreement BEFORE UPDATE OR DELETE ON pactum."Agreement" FOR EACH ROW EXECUTE FUNCTION pactum.protect_immutable();
CREATE TRIGGER immutable_mandate BEFORE UPDATE OR DELETE ON pactum."MandateRevision" FOR EACH ROW EXECUTE FUNCTION pactum.protect_immutable();
CREATE FUNCTION pactum.protect_fx() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','version','updatedAt','lockedAt','consumedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedAt','lockedAt','consumedAt']) THEN RAISE EXCEPTION 'FX commitment is immutable' USING ERRCODE='23514'; END IF;
 IF (OLD.status='CONSUMED' AND NEW.status<>'CONSUMED') OR (OLD.status='LOCKED' AND NEW.status NOT IN('LOCKED','CONSUMED','EXPIRED')) OR (OLD.status='EXPIRED' AND NEW.status<>'EXPIRED') THEN RAISE EXCEPTION 'Invalid FX transition' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER immutable_fx BEFORE UPDATE ON pactum."FxCommitment" FOR EACH ROW EXECUTE FUNCTION pactum.protect_fx();
CREATE FUNCTION pactum.protect_membership() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 DECLARE actor text; owners integer;
 BEGIN
 PERFORM id FROM pactum."Organization" WHERE id=OLD."organizationId" FOR UPDATE;
 actor:=pactum.member_role(OLD."organizationId");
 IF actor='ADMIN' AND (OLD.role IN('OWNER','ADMIN','FINANCE_MANAGER') OR NEW.role IN('OWNER','ADMIN','FINANCE_MANAGER')) THEN RAISE EXCEPTION 'Role escalation prohibited' USING ERRCODE='42501'; END IF;
 IF OLD.role='OWNER' AND OLD.status='ACTIVE' AND (NEW.role<>'OWNER' OR NEW.status<>'ACTIVE') THEN
 SELECT count(*) INTO owners FROM pactum."OrganizationMembership" WHERE "organizationId"=OLD."organizationId" AND role='OWNER' AND status='ACTIVE';
 IF owners<=1 THEN RAISE EXCEPTION 'Last OWNER cannot be removed' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
 END $$;
CREATE TRIGGER membership_guard BEFORE UPDATE ON pactum."OrganizationMembership" FOR EACH ROW EXECUTE FUNCTION pactum.protect_membership();
CREATE FUNCTION pactum.protect_terminal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 BEGIN
 IF OLD.status='SETTLED' AND NEW.status NOT IN('SETTLED','DISPUTED') OR OLD.status='PAYPAL_CAPTURED' AND NEW.status NOT IN('PAYPAL_CAPTURED','SETTLED','DISPUTED') OR OLD.status='DISPUTED' AND NEW.status<>'DISPUTED' OR OLD.status='CANCELLED' AND NEW.status NOT IN('CANCELLED','MANDATE_PENDING') THEN RAISE EXCEPTION 'Terminal transition prohibited' USING ERRCODE='23514'; END IF;
 IF OLD.status='CANCELLED' AND NEW.status='MANDATE_PENDING' AND NEW.snapshot=OLD.snapshot THEN RAISE EXCEPTION 'Explicit revision required' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER terminal_guard BEFORE UPDATE ON pactum."ProcurementSession" FOR EACH ROW EXECUTE FUNCTION pactum.protect_terminal();

ALTER TABLE pactum."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."User" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."Organization" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."OrganizationMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."OrganizationMembership" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."OrganizationInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."OrganizationInvitation" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."ProcurementSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."ProcurementSession" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."MandateRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."MandateRevision" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."Agreement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."Agreement" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."FxCommitment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."FxCommitment" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."FinancialOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."FinancialOperation" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."Settlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."Settlement" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."Dispute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."Dispute" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."EvidenceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."EvidenceRecord" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."IdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."IdempotencyRecord" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."WebhookEvent" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."MigrationBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."MigrationBatch" FORCE ROW LEVEL SECURITY;

ALTER TABLE pactum."MigrationSourceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE pactum."MigrationSourceRecord" FORCE ROW LEVEL SECURITY;

-- Policy predicates need these reads to avoid recursive tenant checks under FORCE RLS.
CREATE POLICY predicate_read ON pactum."User" FOR SELECT TO pactum_policy_reader USING(true);
CREATE POLICY predicate_read ON pactum."Organization" FOR SELECT TO pactum_policy_reader USING(true);
CREATE POLICY predicate_read ON pactum."OrganizationMembership" FOR SELECT TO pactum_policy_reader USING(true);
CREATE POLICY predicate_read ON pactum."OrganizationInvitation" FOR SELECT TO pactum_policy_reader USING(true);
CREATE POLICY predicate_read ON pactum."ProcurementSession" FOR SELECT TO pactum_policy_reader USING(true);
CREATE POLICY predicate_read ON pactum."FinancialOperation" FOR SELECT TO pactum_policy_reader USING(true);
CREATE POLICY predicate_read ON pactum."WebhookEvent" FOR SELECT TO pactum_policy_reader USING(true);
CREATE POLICY predicate_read ON pactum."Settlement" FOR SELECT TO pactum_policy_reader USING(true);

GRANT SELECT,INSERT,UPDATE ON pactum."User", pactum."Organization", pactum."OrganizationMembership", pactum."OrganizationInvitation" TO pactum_runtime;
CREATE POLICY user_self ON pactum."User" TO pactum_runtime USING("authId"=NULLIF(current_setting('app.auth_user_id',true),'')::uuid AND pactum.auth_session_active()) WITH CHECK("authId"=NULLIF(current_setting('app.auth_user_id',true),'')::uuid AND pactum.auth_session_active());
CREATE POLICY organization_read ON pactum."Organization" FOR SELECT TO pactum_runtime USING(pactum.member_role(id) IS NOT NULL OR "createdBy"=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY organization_create ON pactum."Organization" FOR INSERT TO pactum_runtime WITH CHECK("createdBy"=NULLIF(current_setting('app.user_id',true),'')::uuid AND pactum.auth_session_active());
CREATE POLICY organization_update ON pactum."Organization" FOR UPDATE TO pactum_runtime USING(pactum.member_role(id)='OWNER') WITH CHECK(pactum.member_role(id)='OWNER');
CREATE POLICY membership_read ON pactum."OrganizationMembership" FOR SELECT TO pactum_runtime USING("userId"=NULLIF(current_setting('app.user_id',true),'')::uuid OR pactum.member_role("organizationId") IN('OWNER','ADMIN'));
CREATE POLICY membership_create ON pactum."OrganizationMembership" FOR INSERT TO pactum_runtime WITH CHECK(pactum.member_role("organizationId")='OWNER' OR pactum.member_role("organizationId")='ADMIN' AND role IN('PROCUREMENT_MANAGER','VIEWER') OR role='OWNER' AND "userId"=NULLIF(current_setting('app.user_id',true),'')::uuid AND pactum.organization_empty("organizationId") AND EXISTS(SELECT 1 FROM pactum."Organization" o WHERE o.id="organizationId" AND o."createdBy"=NULLIF(current_setting('app.user_id',true),'')::uuid));
CREATE POLICY membership_update ON pactum."OrganizationMembership" FOR UPDATE TO pactum_runtime USING(pactum.member_role("organizationId") IN('OWNER','ADMIN')) WITH CHECK(pactum.member_role("organizationId") IN('OWNER','ADMIN'));
CREATE POLICY invitation_access ON pactum."OrganizationInvitation" TO pactum_runtime USING(pactum.member_role("organizationId") IN('OWNER','ADMIN')) WITH CHECK(pactum.member_role("organizationId")='OWNER' OR pactum.member_role("organizationId")='ADMIN' AND role IN('PROCUREMENT_MANAGER','VIEWER'));
GRANT SELECT,INSERT,UPDATE ON pactum."ProcurementSession" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."ProcurementSession" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."MandateRevision" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."MandateRevision" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."Agreement" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."Agreement" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."FxCommitment" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."FxCommitment" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."FinancialOperation" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."FinancialOperation" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."Settlement" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."Settlement" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."Dispute" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."Dispute" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."EvidenceRecord" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."EvidenceRecord" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,INSERT,UPDATE ON pactum."IdempotencyRecord" TO pactum_runtime;
CREATE POLICY tenant_access ON pactum."IdempotencyRecord" TO pactum_runtime USING(pactum.tenant_scope("organizationId")) WITH CHECK(pactum.tenant_scope("organizationId"));
GRANT SELECT,UPDATE ON pactum."ProcurementSession" TO pactum_worker;
CREATE POLICY worker_access ON pactum."ProcurementSession" TO pactum_worker USING(pactum.worker_session_scope("organizationId",id)) WITH CHECK(pactum.worker_session_scope("organizationId",id));
GRANT SELECT,UPDATE ON pactum."FxCommitment" TO pactum_worker;
CREATE POLICY worker_access ON pactum."FxCommitment" TO pactum_worker USING(pactum.worker_session_scope("organizationId","sessionId")) WITH CHECK(pactum.worker_session_scope("organizationId","sessionId"));
GRANT SELECT,UPDATE ON pactum."FinancialOperation" TO pactum_worker;
CREATE POLICY worker_access ON pactum."FinancialOperation" TO pactum_worker USING(id=NULLIF(current_setting('app.job_id',true),'')::uuid AND pactum.tenant_scope("organizationId")) WITH CHECK(id=NULLIF(current_setting('app.job_id',true),'')::uuid AND pactum.tenant_scope("organizationId"));
GRANT SELECT,UPDATE ON pactum."Settlement" TO pactum_worker;
CREATE POLICY worker_access ON pactum."Settlement" TO pactum_worker USING(pactum.worker_session_scope("organizationId","sessionId")) WITH CHECK(pactum.worker_session_scope("organizationId","sessionId"));
GRANT SELECT,UPDATE ON pactum."Dispute" TO pactum_worker;
CREATE POLICY worker_access ON pactum."Dispute" FOR SELECT TO pactum_worker USING(pactum.worker_session_scope("organizationId","sessionId"));
CREATE POLICY worker_dispute_update ON pactum."Dispute" FOR UPDATE TO pactum_worker USING(pactum.worker_session_scope("organizationId","sessionId")) WITH CHECK(pactum.worker_session_scope("organizationId","sessionId"));
CREATE POLICY worker_dispute_insert ON pactum."Dispute" FOR INSERT TO pactum_worker WITH CHECK(pactum.worker_session_scope("organizationId","sessionId") AND EXISTS(SELECT 1 FROM pactum."WebhookEvent" w WHERE w.id=NULLIF(current_setting('app.job_id',true),'')::uuid AND w."eventType"='CUSTOMER.DISPUTE.CREATED'));
GRANT SELECT,UPDATE ON pactum."EvidenceRecord" TO pactum_worker;
CREATE POLICY worker_access ON pactum."EvidenceRecord" TO pactum_worker USING(pactum.worker_session_scope("organizationId","sessionId")) WITH CHECK(pactum.worker_session_scope("organizationId","sessionId"));

GRANT INSERT ON pactum."EvidenceRecord" TO pactum_worker;
GRANT INSERT ON pactum."Dispute" TO pactum_worker;
GRANT SELECT,INSERT,UPDATE ON pactum."WebhookEvent" TO pactum_worker;
CREATE POLICY webhook_worker_read ON pactum."WebhookEvent" FOR SELECT TO pactum_worker USING(true);
CREATE POLICY webhook_worker_insert ON pactum."WebhookEvent" FOR INSERT TO pactum_worker WITH CHECK(status IN('PROCESSING','QUARANTINED') AND "leaseToken" IS NOT NULL AND "leaseExpiresAt">now());
CREATE POLICY webhook_worker_update ON pactum."WebhookEvent" FOR UPDATE TO pactum_worker
 USING(status IN('RECEIVED','FAILED') OR (status='PROCESSING' AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt"<=now()))
 OR (status='PROCESSING' AND id=NULLIF(current_setting('app.job_id',true),'')::uuid AND "leaseToken"=NULLIF(current_setting('app.lease_token',true),'')::uuid AND "leaseExpiresAt">now()))
 WITH CHECK((id=NULLIF(current_setting('app.job_id',true),'')::uuid AND "leaseToken"=NULLIF(current_setting('app.lease_token',true),'')::uuid AND status IN('PROCESSING','PROCESSED','FAILED'))
 OR (status IN('PROCESSING','QUARANTINED') AND "leaseToken" IS NOT NULL AND "leaseExpiresAt">now()));
CREATE POLICY webhook_tenant ON pactum."WebhookEvent" FOR SELECT TO pactum_runtime USING(pactum.member_role("organizationId") IN('OWNER','FINANCE_MANAGER'));
-- Only fixed binding metadata is exposed to worker lookup, not arbitrary session enumeration.
CREATE FUNCTION pactum.resolve_order(order_id text, merchant text) RETURNS TABLE("organizationId" uuid,"sessionPublicId" text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s."organizationId",p."publicId" FROM pactum."Settlement" s JOIN pactum."ProcurementSession" p ON p.id=s."sessionId" AND p."organizationId"=s."organizationId" WHERE s."orderId"=order_id AND s."merchantId"=merchant AND s.environment='SANDBOX';
$$;
ALTER FUNCTION pactum.resolve_order(text,text) OWNER TO pactum_policy_reader;
REVOKE ALL ON FUNCTION pactum.resolve_order(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pactum.resolve_order(text,text) TO pactum_worker;

CREATE FUNCTION pactum.auth_email() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT pactum.verified_auth_email();
$$;
CREATE FUNCTION pactum.valid_invitation(org uuid, requested_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM pactum."OrganizationInvitation" i JOIN pactum."OrganizationMembership" m ON m."organizationId"=i."organizationId" AND m."userId"=i."invitedBy"
 WHERE i."organizationId"=org AND i."tokenHash"=current_setting('app.invitation_hash',true) AND i.email=pactum.auth_email() AND i.role::text=requested_role
 AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL AND i."expiresAt">now() AND m.status='ACTIVE'
 AND (m.role='OWNER' OR m.role='ADMIN' AND i.role IN('PROCUREMENT_MANAGER','VIEWER')));
$$;
ALTER FUNCTION pactum.auth_email() OWNER TO pactum_policy_reader;
ALTER FUNCTION pactum.valid_invitation(uuid,text) OWNER TO pactum_policy_reader;
REVOKE ALL ON FUNCTION pactum.auth_email(), pactum.valid_invitation(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pactum.auth_email(), pactum.valid_invitation(uuid,text) TO pactum_runtime,pactum_policy_reader;
CREATE POLICY invitation_recipient_read ON pactum."OrganizationInvitation" FOR SELECT TO pactum_runtime USING(email=pactum.auth_email() AND "tokenHash"=current_setting('app.invitation_hash',true));
CREATE POLICY invitation_recipient_accept ON pactum."OrganizationInvitation" FOR UPDATE TO pactum_runtime USING(email=pactum.auth_email() AND "tokenHash"=current_setting('app.invitation_hash',true) AND "acceptedAt" IS NULL) WITH CHECK("acceptedBy"=NULLIF(current_setting('app.user_id',true),'')::uuid AND email=pactum.auth_email());
CREATE POLICY membership_invitation_accept ON pactum."OrganizationMembership" FOR INSERT TO pactum_runtime WITH CHECK("userId"=NULLIF(current_setting('app.user_id',true),'')::uuid AND pactum.valid_invitation("organizationId",role::text));
CREATE FUNCTION pactum.protect_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 BEGIN IF (to_jsonb(NEW)-ARRAY['acceptedBy','acceptedAt','revokedAt','updatedAt','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['acceptedBy','acceptedAt','revokedAt','updatedAt','version']) OR OLD."acceptedAt" IS NOT NULL THEN RAISE EXCEPTION 'Invitation is immutable or already accepted' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER invitation_guard BEFORE UPDATE ON pactum."OrganizationInvitation" FOR EACH ROW EXECUTE FUNCTION pactum.protect_invitation();
REVOKE CREATE ON SCHEMA pactum FROM pactum_policy_reader;
