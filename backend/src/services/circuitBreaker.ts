import { logger } from "../logger.js";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  /** Name for logging */
  name: string;
  /** How many 429s before opening the circuit */
  failureThreshold: number;
  /** Default cooldown in ms when no Retry-After header is present */
  defaultCooldownMs: number;
  /** Maximum cooldown in ms (caps Retry-After and backoff) */
  maxCooldownMs: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  name: "coingecko",
  failureThreshold: 2,
  defaultCooldownMs: 60_000,
  maxCooldownMs: 300_000,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private reopenAt = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Wraps a fetch call with circuit breaker logic.
   * - If circuit is open and cooldown hasn't elapsed, throws immediately.
   * - If circuit is open and cooldown has elapsed, allows one probe request (half-open).
   * - On 429 response, records failure, parses Retry-After, and may open circuit.
   * - On success, resets the circuit to closed.
   *
   * Returns the Response on success (non-429).
   * Throws CircuitOpenError if the circuit is open.
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    this.checkCircuit();

    const response = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });

    if (response.status === 429) {
      this.recordFailure(response);
      return response;
    }

    // Any non-429 response means the API is healthy
    this.recordSuccess();
    return response;
  }

  /** Throws if circuit is open and cooldown hasn't elapsed. */
  private checkCircuit(): void {
    if (this.state === "closed") return;

    const now = Date.now();
    if (now < this.reopenAt) {
      const waitSec = Math.ceil((this.reopenAt - now) / 1000);
      throw new CircuitOpenError(
        `${this.options.name} circuit breaker is open — retry in ${waitSec}s`,
        this.reopenAt
      );
    }

    // Cooldown elapsed → half-open: allow one probe request
    this.state = "half-open";
    logger.info("circuit breaker half-open, probing", {
      name: this.options.name,
    });
  }

  private recordFailure(response: Response): void {
    this.failureCount++;

    const cooldownMs = this.parseCooldown(response);

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "open";
      this.reopenAt = Date.now() + cooldownMs;

      logger.warn("circuit breaker opened", {
        name: this.options.name,
        failures: this.failureCount,
        cooldownMs,
        reopenAt: new Date(this.reopenAt).toISOString(),
      });
    } else {
      logger.warn("circuit breaker recorded 429", {
        name: this.options.name,
        failures: this.failureCount,
        threshold: this.options.failureThreshold,
      });
    }
  }

  private recordSuccess(): void {
    if (this.state !== "closed") {
      logger.info("circuit breaker closed — API recovered", {
        name: this.options.name,
        previousFailures: this.failureCount,
      });
    }
    this.state = "closed";
    this.failureCount = 0;
    this.reopenAt = 0;
  }

  /**
   * Parses cooldown from Retry-After header.
   * Supports both seconds ("60") and HTTP-date ("Thu, 01 Dec 2025 16:00:00 GMT").
   * Falls back to exponential backoff based on failure count.
   */
  private parseCooldown(response: Response): number {
    const retryAfter = response.headers.get("retry-after");

    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!isNaN(seconds) && seconds > 0) {
        const ms = seconds * 1000;
        logger.info("using Retry-After header", {
          name: this.options.name,
          retryAfterSeconds: seconds,
        });
        return Math.min(ms, this.options.maxCooldownMs);
      }

      // Try HTTP-date format
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        const ms = date.getTime() - Date.now();
        if (ms > 0) {
          logger.info("using Retry-After date header", {
            name: this.options.name,
            retryAfterDate: retryAfter,
          });
          return Math.min(ms, this.options.maxCooldownMs);
        }
      }
    }

    // Exponential backoff: default * 2^(failures-1), capped at max
    const backoff =
      this.options.defaultCooldownMs * Math.pow(2, this.failureCount - 1);
    return Math.min(backoff, this.options.maxCooldownMs);
  }

  /** Current state for testing/monitoring. */
  getState(): { state: CircuitState; failureCount: number; reopenAt: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      reopenAt: this.reopenAt,
    };
  }

  /** Reset circuit breaker to initial state (useful for tests). */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.reopenAt = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly reopenAt: number
  ) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

/** Shared circuit breaker instance for all CoinGecko calls. */
export const coingeckoCircuit = new CircuitBreaker({ name: "coingecko" });

/** Shared circuit breaker instance for all CryptoCompare calls. */
export const cryptoCompareCircuit = new CircuitBreaker({ name: "cryptocompare" });
