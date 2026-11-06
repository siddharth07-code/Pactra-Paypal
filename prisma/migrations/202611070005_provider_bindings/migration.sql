CREATE UNIQUE INDEX "ProcurementSession_publicId_organizationId_key" ON pactum."ProcurementSession"("publicId","organizationId");
ALTER TABLE pactum."WebhookEvent" ADD CONSTRAINT "WebhookEvent_sessionPublicId_organizationId_fkey" FOREIGN KEY("sessionPublicId","organizationId") REFERENCES pactum."ProcurementSession"("publicId","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX unique_confirmed_provider_resource ON pactum."FinancialOperation"(provider,environment,"merchantId",kind,"providerResourceId") WHERE "providerResourceId" IS NOT NULL;
