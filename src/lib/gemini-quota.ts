/**
 * PACTUM — Gemini Quota Protection & Circuit Breaker Subsystem
 *
 * Coordinates Gemini API requests across the application with:
 * 1. Global sliding-window request throttling (requests per minute).
 * 2. Strict concurrency control (max concurrent in-flight calls).
 * 3. 3-state Circuit Breaker (CLOSED, OPEN, HALF_OPEN) with automatic cooldown.
 * 4. Bounded retry budgeting to eliminate retry amplification.
 * 5. Structured observability without exposing API keys or confidential prompts.
 * 6. Fail-fast deterministic fallback integration preserving economic invariants.
 *
 * Follows GEMINI.md Section 5, 10, SECURITY.md Section 2, 4, and Phase 3 specifications.
 */

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type CircuitState = CircuitBreakerState;

export interface GeminiQuotaConfig {
  maxRequestsPerMinute: number;
  maxConcurrentRequests: number;
  maxAttempts: number;
  providerTimeoutMs: number;
  circuitBreakerThreshold: number; // Consecutive failures before opening
  circuitBreakerCooldownMs: number; // Cooldown duration in ms
}

export interface GeminiQuotaStatus {
  circuitState: CircuitBreakerState;
  consecutiveFailures: number;
  activeRequests: number;
  requestsInCurrentWindow: number;
  windowLimit: number;
  circuitOpenedAt?: string;
  cooldownRemainingMs: number;
  isAdmissible: boolean;
}

export type QuotaRejectionReason =
  | "CIRCUIT_OPEN"
  | "PROBE_IN_PROGRESS"
  | "HALF_OPEN_PROBE_IN_FLIGHT"
  | "QUOTA_EXHAUSTED"
  | "CONCURRENCY_LIMIT_REACHED";

export class GeminiQuotaError extends Error {
  public readonly reason: QuotaRejectionReason;
  public readonly retryAfterMs: number;

  constructor(reason: QuotaRejectionReason, message: string, retryAfterMs = 0) {
    super(message);
    this.name = "GeminiQuotaError";
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

export class GeminiQuotaCoordinator {
  private config: GeminiQuotaConfig;
  private circuitState: CircuitBreakerState = "CLOSED";
  private consecutiveFailures = 0;
  private circuitOpenedAt = 0;
  private customCooldownMs = 0;
  private activeConcurrent = 0;
  private requestTimestamps: number[] = [];
  private isProbeExecuting = false;

  constructor(customConfig?: Partial<GeminiQuotaConfig>) {
    this.config = {
      maxRequestsPerMinute: Number(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE) || 10,
      maxConcurrentRequests: Number(process.env.GEMINI_MAX_CONCURRENT_REQUESTS) || 2,
      maxAttempts: Number(process.env.GEMINI_MAX_ATTEMPTS) || 2,
      providerTimeoutMs: Number(process.env.GEMINI_PROVIDER_TIMEOUT_MS) || 5000,
      circuitBreakerThreshold: Number(process.env.GEMINI_CIRCUIT_BREAKER_THRESHOLD) || 3,
      circuitBreakerCooldownMs: Number(process.env.GEMINI_CIRCUIT_BREAKER_COOLDOWN_MS) || 60000,
      ...customConfig,
    };
  }

  public getConfig(): GeminiQuotaConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<GeminiQuotaConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Evaluates current circuit state and transitions OPEN -> HALF_OPEN if cooldown elapsed.
   */
  private evaluateCircuitState(now: number): CircuitBreakerState {
    if (this.circuitState === "OPEN") {
      const cooldown = this.customCooldownMs || this.config.circuitBreakerCooldownMs;
      if (now >= this.circuitOpenedAt + cooldown) {
        this.circuitState = "HALF_OPEN";
        this.isProbeExecuting = false;
        this.logEvent("GEMINI_CIRCUIT_HALF_OPEN", {
          message: "Circuit cooldown expired. Entering HALF_OPEN probe state.",
        });
      }
    }
    return this.circuitState;
  }

  /**
   * Cleans expired timestamps from the 60-second sliding window.
   */
  private cleanSlidingWindow(now: number): void {
    const threshold = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > threshold);
  }

  public getCircuitState(now: number = Date.now()): CircuitState {
    return this.evaluateCircuitState(now);
  }

  public recordRequestStart(now: number = Date.now()): void {
    this.cleanSlidingWindow(now);
    this.requestTimestamps.push(now);
  }

  public acquireConcurrencySlot(): void {
    this.activeConcurrent++;
  }

  public releaseConcurrencySlot(): void {
    this.activeConcurrent = Math.max(0, this.activeConcurrent - 1);
  }

  /**
   * Checks whether a new Gemini call can be admitted right now.
   * If not, returns the rejection reason and cooldown time.
   */
  public checkAdmission(): {
    admissible: boolean;
    allowed: boolean;
    reason?: QuotaRejectionReason;
    retryAfterMs?: number;
  } {
    const now = Date.now();
    const state = this.evaluateCircuitState(now);

    if (state === "OPEN") {
      const cooldown = this.customCooldownMs || this.config.circuitBreakerCooldownMs;
      const remainingMs = Math.max(0, this.circuitOpenedAt + cooldown - now);
      return {
        admissible: false,
        allowed: false,
        reason: "CIRCUIT_OPEN",
        retryAfterMs: remainingMs,
      };
    }

    if (state === "HALF_OPEN") {
      if (this.isProbeExecuting) {
        return {
          admissible: false,
          allowed: false,
          reason: "HALF_OPEN_PROBE_IN_FLIGHT",
          retryAfterMs: 2000,
        };
      }
      // Single probe allowed and marked active
      this.isProbeExecuting = true;
      return { admissible: true, allowed: true };
    }

    // Check concurrency limit
    if (this.activeConcurrent >= this.config.maxConcurrentRequests) {
      return {
        admissible: false,
        allowed: false,
        reason: "CONCURRENCY_LIMIT_REACHED",
        retryAfterMs: 500,
      };
    }

    // Check sliding window rate limit (requests per minute)
    this.cleanSlidingWindow(now);
    if (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
      const oldest = this.requestTimestamps[0] ?? now;
      const retryAfterMs = Math.max(1000, oldest + 60000 - now);
      return {
        admissible: false,
        allowed: false,
        reason: "QUOTA_EXHAUSTED",
        retryAfterMs,
      };
    }

    return { admissible: true, allowed: true };
  }

  /**
   * Executes a Gemini API call within strict admission, timeout, and circuit tracking rules.
   */
  public async execute<T>(
    operationName: string,
    action: (signal: AbortSignal) => Promise<T>,
    options?: { maxAttempts?: number }
  ): Promise<T> {
    const maxAttempts = Math.min(options?.maxAttempts ?? this.config.maxAttempts, 3);
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt++;
      const admission = this.checkAdmission();

      if (!admission.admissible) {
        const error = new GeminiQuotaError(
          admission.reason ?? "QUOTA_EXHAUSTED",
          `Gemini request rejected by quota protection: ${admission.reason}. Retry after ${Math.ceil((admission.retryAfterMs ?? 0) / 1000)}s.`,
          admission.retryAfterMs
        );
        this.logEvent("GEMINI_REQUEST_REJECTED", {
          operationName,
          reason: admission.reason,
          retryAfterMs: admission.retryAfterMs,
        });
        throw error;
      }

      // Claim execution slot
      const isProbe = this.circuitState === "HALF_OPEN";
      if (isProbe) {
        this.isProbeExecuting = true;
      }
      this.activeConcurrent++;
      const callStart = Date.now();
      this.requestTimestamps.push(callStart);

      const controller = new AbortController();
      let timeoutHandle: NodeJS.Timeout | undefined;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          reject(new Error(`PROVIDER_TIMEOUT: Gemini request exceeded ${this.config.providerTimeoutMs}ms.`));
        }, this.config.providerTimeoutMs);
      });

      try {
        this.logEvent("GEMINI_REQUEST_ADMITTED", {
          operationName,
          attempt,
          maxAttempts,
          isProbe,
          activeConcurrent: this.activeConcurrent,
        });

        const result = await Promise.race([action(controller.signal), timeoutPromise]);

        // Success: record healthy state
        this.recordSuccess(isProbe);
        return result;
      } catch (err: unknown) {
        lastError = err;
        const isQuotaFailure = this.isRateLimitOrQuotaError(err);
        const isTransientServerFailure = this.isTransientServerError(err);

        this.recordFailure(err, isProbe, isQuotaFailure);

        // Decide whether retry is permitted
        if (attempt < maxAttempts && isTransientServerFailure && !isQuotaFailure) {
          // Bounded jittered backoff for eligible transient 5xx
          await new Promise((r) => setTimeout(r, 200 * attempt));
          continue;
        }

        // Quota exhaustion or permanent failure does NOT retry; fail immediately
        throw err;
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.activeConcurrent = Math.max(0, this.activeConcurrent - 1);
        if (isProbe) {
          this.isProbeExecuting = false;
        }
      }
    }

    throw lastError;
  }

  public recordSuccess(wasProbe: boolean = false): void {
    this.consecutiveFailures = 0;
    this.isProbeExecuting = false;
    if (this.circuitState !== "CLOSED") {
      this.circuitState = "CLOSED";
      this.circuitOpenedAt = 0;
      this.customCooldownMs = 0;
      this.logEvent("GEMINI_CIRCUIT_CLOSED", {
        message: "Gemini provider successfully recovered. Circuit CLOSED.",
        wasProbe,
      });
    }
  }

  public recordFailure(err: unknown, wasProbe: boolean = false, isQuotaFailure?: boolean): void {
    const now = Date.now();
    this.consecutiveFailures++;
    this.isProbeExecuting = false;
    const isQuota = isQuotaFailure ?? this.isRateLimitOrQuotaError(err);

    if (isQuota) {
      // 429 quota exhaustion immediately opens circuit
      this.circuitState = "OPEN";
      this.circuitOpenedAt = now;
      // Extract retry-after if present, otherwise default cooldown
      const retrySec = this.extractRetryAfterSeconds(err);
      this.customCooldownMs = retrySec ? retrySec * 1000 : this.config.circuitBreakerCooldownMs;

      this.logEvent("GEMINI_CIRCUIT_OPENED", {
        reason: "QUOTA_EXHAUSTED",
        consecutiveFailures: this.consecutiveFailures,
        cooldownMs: this.customCooldownMs,
        message: "Google Gemini 429 quota limit encountered. Circuit opened.",
      });
      return;
    }

    if (wasProbe) {
      // Probe failed: return circuit to OPEN
      this.circuitState = "OPEN";
      this.circuitOpenedAt = now;
      this.customCooldownMs = this.config.circuitBreakerCooldownMs;
      this.logEvent("GEMINI_CIRCUIT_OPENED", {
        reason: "PROBE_FAILED",
        consecutiveFailures: this.consecutiveFailures,
        message: "HALF_OPEN probe request failed. Returning circuit to OPEN.",
      });
      return;
    }

    if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      this.circuitState = "OPEN";
      this.circuitOpenedAt = now;
      this.customCooldownMs = this.config.circuitBreakerCooldownMs;
      this.logEvent("GEMINI_CIRCUIT_OPENED", {
        reason: "CONSECUTIVE_FAILURES_THRESHOLD",
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.config.circuitBreakerThreshold,
        message: `Gemini consecutive failures (${this.consecutiveFailures}) reached threshold. Circuit opened.`,
      });
    }
  }

  private isRateLimitOrQuotaError(err: unknown): boolean {
    if (!err) return false;
    const msg = String(err).toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("resource_exhausted") ||
      msg.includes("rate limit") ||
      msg.includes("ratelimit")
    );
  }

  private isTransientServerError(err: unknown): boolean {
    if (!err) return false;
    const msg = String(err).toLowerCase();
    return (
      msg.includes("503") ||
      msg.includes("504") ||
      msg.includes("econnreset") ||
      msg.includes("provider_timeout") ||
      msg.includes("timed out")
    );
  }

  private extractRetryAfterSeconds(err: unknown): number | null {
    if (!err) return null;
    const msg = String(err);
    const match = msg.match(/retry(?:-after|\s+after)?\s*[:=]?\s*(\d+)/i);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 3600) {
        return parsed;
      }
    }
    return null;
  }

  public getStatus(): GeminiQuotaStatus {
    const now = Date.now();
    const state = this.evaluateCircuitState(now);
    const cooldown = this.customCooldownMs || this.config.circuitBreakerCooldownMs;
    const remainingMs = state === "OPEN" ? Math.max(0, this.circuitOpenedAt + cooldown - now) : 0;
    this.cleanSlidingWindow(now);

    return {
      circuitState: state,
      consecutiveFailures: this.consecutiveFailures,
      activeRequests: this.activeConcurrent,
      requestsInCurrentWindow: this.requestTimestamps.length,
      windowLimit: this.config.maxRequestsPerMinute,
      circuitOpenedAt: this.circuitOpenedAt ? new Date(this.circuitOpenedAt).toISOString() : undefined,
      cooldownRemainingMs: remainingMs,
      isAdmissible: this.checkAdmission().admissible,
    };
  }

  public reset(): void {
    this.circuitState = "CLOSED";
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = 0;
    this.customCooldownMs = 0;
    this.activeConcurrent = 0;
    this.requestTimestamps = [];
    this.isProbeExecuting = false;
  }

  public forceOpen(cooldownMs?: number): void {
    this.circuitState = "OPEN";
    this.circuitOpenedAt = Date.now();
    this.customCooldownMs = cooldownMs ?? this.config.circuitBreakerCooldownMs;
  }

  private logEvent(eventType: string, details: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "test") {
      const sanitized = JSON.stringify({
        component: "GeminiQuotaProtection",
        event: eventType,
        timestamp: new Date().toISOString(),
        ...details,
      });
      console.log(sanitized);
    }
  }
}

// Global singleton instance across Next.js chunks
const globalForGeminiQuota = globalThis as unknown as {
  pactumGeminiQuotaCoordinator?: GeminiQuotaCoordinator;
};

export const defaultGeminiQuotaCoordinator =
  globalForGeminiQuota.pactumGeminiQuotaCoordinator ?? new GeminiQuotaCoordinator();

if (process.env.NODE_ENV !== "production") {
  globalForGeminiQuota.pactumGeminiQuotaCoordinator = defaultGeminiQuotaCoordinator;
}
