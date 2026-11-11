ALTER TABLE pactum."FinancialOperation" ADD CONSTRAINT financial_actor_fk FOREIGN KEY("requestedBy") REFERENCES pactum."User"(id) ON DELETE RESTRICT;
ALTER TABLE pactum."ProcurementSession" ADD CONSTRAINT session_actor_fk FOREIGN KEY("createdBy") REFERENCES pactum."User"(id) ON DELETE RESTRICT;
ALTER TABLE pactum."EvidenceRecord" ADD CONSTRAINT evidence_sequence CHECK((kind='FLIGHT_EVENT' AND sequence IS NOT NULL AND sequence>=0) OR (kind<>'FLIGHT_EVENT' AND sequence IS NULL));
CREATE FUNCTION pactum.protect_operation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','response','providerResourceId','leaseToken','leaseExpiresAt','lastErrorCode','attemptCount','updatedAt','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','response','providerResourceId','leaseToken','leaseExpiresAt','lastErrorCode','attemptCount','updatedAt','version']) THEN RAISE EXCEPTION 'Financial intent identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='SUCCEEDED' AND NEW.status<>'SUCCEEDED' THEN RAISE EXCEPTION 'Confirmed operation cannot be downgraded' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER operation_identity BEFORE UPDATE ON pactum."FinancialOperation" FOR EACH ROW EXECUTE FUNCTION pactum.protect_operation();
CREATE FUNCTION pactum.protect_pending_finance() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status IN('CANCELLED','MANDATE_PENDING','NEGOTIATING','DISPUTED') AND NEW.status<>OLD.status AND EXISTS(SELECT 1 FROM pactum."FinancialOperation" WHERE "sessionId"=OLD.id AND "organizationId"=OLD."organizationId" AND status IN('SUBMITTING','UNCERTAIN')) THEN RAISE EXCEPTION 'Uncertain financial operations must be reconciled first' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pending_finance_guard BEFORE UPDATE ON pactum."ProcurementSession" FOR EACH ROW EXECUTE FUNCTION pactum.protect_pending_finance();
GRANT SELECT ON pactum."MandateRevision", pactum."Agreement" TO pactum_worker;
CREATE POLICY worker_read_mandates ON pactum."MandateRevision" FOR SELECT TO pactum_worker USING(pactum.worker_session_scope("organizationId","sessionId"));
CREATE POLICY worker_read_agreements ON pactum."Agreement" FOR SELECT TO pactum_worker USING(pactum.worker_session_scope("organizationId","sessionId"));
