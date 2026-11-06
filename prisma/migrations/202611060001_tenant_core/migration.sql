-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pactum";

-- CreateEnum
CREATE TYPE "pactum"."OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'PROCUREMENT_MANAGER', 'FINANCE_MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "pactum"."MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "pactum"."SessionStatus" AS ENUM ('MANDATE_PENDING', 'SOURCING', 'NEGOTIATING', 'AUDIT_PENDING', 'AUDIT_PASSED', 'AUDIT_FAILED', 'AWAITING_PAYPAL_APPROVAL', 'PAYPAL_AUTHORIZED', 'PAYPAL_CAPTURED', 'SETTLED', 'CANCELLED', 'CAPTURE_PENDING_RECONCILIATION', 'DISPUTED');

-- CreateEnum
CREATE TYPE "pactum"."OperationStatus" AS ENUM ('INTENT_RECORDED', 'SUBMITTING', 'SUCCEEDED', 'FAILED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "pactum"."WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "pactum"."FxStatus" AS ENUM ('QUOTED', 'LOCKED', 'EXPIRED', 'CONSUMED');

-- CreateTable
CREATE TABLE "pactum"."User" (
    "id" UUID NOT NULL,
    "authId" UUID NOT NULL,
    "disabledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" UUID,
    "slug" TEXT NOT NULL,
    "suspendedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."OrganizationMembership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "pactum"."OrganizationRole" NOT NULL,
    "status" "pactum"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."OrganizationInvitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "pactum"."OrganizationRole" NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "invitedBy" UUID NOT NULL,
    "acceptedBy" UUID,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."ProcurementSession" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdBy" UUID,
    "status" "pactum"."SessionStatus" NOT NULL,
    "snapshot" BYTEA NOT NULL,
    "financialBlockReason" TEXT,
    "preSettlementRoot" VARCHAR(64),
    "postAuditRoot" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProcurementSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."MandateRevision" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "budgetMinor" BIGINT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "canonicalBytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MandateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."Agreement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "mandateRevision" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "shippingMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "agreementHash" VARCHAR(64) NOT NULL,
    "canonicalBytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."FxCommitment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "agreementId" UUID NOT NULL,
    "commitmentVersion" INTEGER NOT NULL,
    "sourceCurrency" VARCHAR(3) NOT NULL,
    "targetCurrency" VARCHAR(3) NOT NULL,
    "sourceAmountMinor" BIGINT NOT NULL,
    "targetAmountMinor" BIGINT NOT NULL,
    "rate" DECIMAL(24,12) NOT NULL,
    "rateText" TEXT NOT NULL,
    "rateConvention" TEXT NOT NULL,
    "rateSource" TEXT NOT NULL,
    "provider" TEXT,
    "providerUpdatedAt" TIMESTAMPTZ(6),
    "retrievedAt" TIMESTAMPTZ(6),
    "quotedAt" TIMESTAMPTZ(6) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "canonicalBytes" BYTEA NOT NULL,
    "conversionHash" VARCHAR(64) NOT NULL,
    "status" "pactum"."FxStatus" NOT NULL,
    "lockedAt" TIMESTAMPTZ(6),
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FxCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."FinancialOperation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "logicalKey" TEXT NOT NULL,
    "status" "pactum"."OperationStatus" NOT NULL DEFAULT 'INTENT_RECORDED',
    "provider" TEXT NOT NULL DEFAULT 'PAYPAL',
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "merchantId" TEXT NOT NULL,
    "providerRequestId" TEXT NOT NULL,
    "providerResourceId" TEXT,
    "authorizationId" TEXT,
    "amountMinor" BIGINT,
    "currency" VARCHAR(3),
    "agreementHash" VARCHAR(64) NOT NULL,
    "fxConversionHash" VARCHAR(64),
    "evidenceRoot" VARCHAR(64) NOT NULL,
    "requestedBy" UUID,
    "request" BYTEA NOT NULL,
    "response" BYTEA,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(6),
    "lastErrorCode" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FinancialOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."Settlement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PAYPAL',
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "merchantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "captureId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "pactum"."SessionStatus" NOT NULL,
    "fxConversionHash" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."Dispute" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidenceRoot" VARCHAR(64) NOT NULL,
    "record" BYTEA NOT NULL,
    "financialDisposition" TEXT NOT NULL DEFAULT 'UNEXECUTED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."EvidenceRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "sequence" INTEGER,
    "schemaVersion" INTEGER NOT NULL,
    "canonicalBytes" BYTEA NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "rootHash" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."IdempotencyRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "status" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "response" BYTEA,
    "executionId" UUID NOT NULL,
    "leaseExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."WebhookEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "sessionPublicId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'PAYPAL',
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "merchantId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" BYTEA NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "pactum"."WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(6),
    "processedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."MigrationBatch" (
    "id" UUID NOT NULL,
    "sourceDigest" VARCHAR(64) NOT NULL,
    "manifestDigest" VARCHAR(64) NOT NULL,
    "status" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MigrationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pactum"."MigrationSourceRecord" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceDigest" VARCHAR(64) NOT NULL,
    "organizationId" UUID,
    "importedId" UUID,
    "status" TEXT NOT NULL,
    "originalBytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MigrationSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "pactum"."User"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "pactum"."Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "pactum"."OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "pactum"."OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "pactum"."OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_email_expiresAt_idx" ON "pactum"."OrganizationInvitation"("organizationId", "email", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementSession_publicId_key" ON "pactum"."ProcurementSession"("publicId");

-- CreateIndex
CREATE INDEX "ProcurementSession_organizationId_updatedAt_id_idx" ON "pactum"."ProcurementSession"("organizationId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "ProcurementSession_organizationId_status_idx" ON "pactum"."ProcurementSession"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementSession_id_organizationId_key" ON "pactum"."ProcurementSession"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MandateRevision_sessionId_organizationId_revision_key" ON "pactum"."MandateRevision"("sessionId", "organizationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_publicId_key" ON "pactum"."Agreement"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_id_organizationId_sessionId_key" ON "pactum"."Agreement"("id", "organizationId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "FxCommitment_publicId_key" ON "pactum"."FxCommitment"("publicId");

-- CreateIndex
CREATE INDEX "FxCommitment_organizationId_sessionId_status_idx" ON "pactum"."FxCommitment"("organizationId", "sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FxCommitment_sessionId_organizationId_conversionHash_key" ON "pactum"."FxCommitment"("sessionId", "organizationId", "conversionHash");

-- CreateIndex
CREATE INDEX "FinancialOperation_status_leaseExpiresAt_idx" ON "pactum"."FinancialOperation"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialOperation_organizationId_sessionId_kind_logicalKey_key" ON "pactum"."FinancialOperation"("organizationId", "sessionId", "kind", "logicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialOperation_provider_environment_merchantId_provider_key" ON "pactum"."FinancialOperation"("provider", "environment", "merchantId", "providerRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_provider_environment_merchantId_orderId_key" ON "pactum"."Settlement"("provider", "environment", "merchantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_provider_environment_merchantId_authorizationId_key" ON "pactum"."Settlement"("provider", "environment", "merchantId", "authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_provider_environment_merchantId_captureId_key" ON "pactum"."Settlement"("provider", "environment", "merchantId", "captureId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_publicId_key" ON "pactum"."Dispute"("publicId");

-- CreateIndex
CREATE INDEX "Dispute_organizationId_sessionId_status_idx" ON "pactum"."Dispute"("organizationId", "sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRecord_sessionId_organizationId_kind_evidenceKey_key" ON "pactum"."EvidenceRecord"("sessionId", "organizationId", "kind", "evidenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRecord_sessionId_organizationId_sequence_key" ON "pactum"."EvidenceRecord"("sessionId", "organizationId", "sequence");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_status_leaseExpiresAt_idx" ON "pactum"."IdempotencyRecord"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organizationId_scope_key_key" ON "pactum"."IdempotencyRecord"("organizationId", "scope", "key");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_leaseExpiresAt_idx" ON "pactum"."WebhookEvent"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_environment_merchantId_providerEventI_key" ON "pactum"."WebhookEvent"("provider", "environment", "merchantId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationBatch_sourceDigest_key" ON "pactum"."MigrationBatch"("sourceDigest");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationSourceRecord_batchId_sourceType_sourceKey_key" ON "pactum"."MigrationSourceRecord"("batchId", "sourceType", "sourceKey");

-- AddForeignKey
ALTER TABLE "pactum"."OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pactum"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "pactum"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pactum"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."ProcurementSession" ADD CONSTRAINT "ProcurementSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pactum"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."MandateRevision" ADD CONSTRAINT "MandateRevision_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "pactum"."ProcurementSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."Agreement" ADD CONSTRAINT "Agreement_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "pactum"."ProcurementSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."FxCommitment" ADD CONSTRAINT "FxCommitment_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "pactum"."ProcurementSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."FinancialOperation" ADD CONSTRAINT "FinancialOperation_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "pactum"."ProcurementSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."Settlement" ADD CONSTRAINT "Settlement_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "pactum"."ProcurementSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."Dispute" ADD CONSTRAINT "Dispute_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "pactum"."ProcurementSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "pactum"."ProcurementSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pactum"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."WebhookEvent" ADD CONSTRAINT "WebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pactum"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."MigrationSourceRecord" ADD CONSTRAINT "MigrationSourceRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "pactum"."MigrationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pactum"."MigrationSourceRecord" ADD CONSTRAINT "MigrationSourceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "pactum"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
