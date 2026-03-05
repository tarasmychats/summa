import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../circuitBreaker.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function make429(retryAfter?: string): Partial<Response> {
  const headers = new Headers();
  if (retryAfter) headers.set("retry-after", retryAfter);
  return { ok: false, status: 429, headers };
}

function make200(): Partial<Response> {
  return { ok: true, status: 200, headers: new Headers() };
}

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.clearAllMocks();
    breaker = new CircuitBreaker({
      name: "test",
      failureThreshold: 2,
      defaultCooldownMs: 60_000,
      maxCooldownMs: 300_000,
    });
  });

  it("passes through successful responses", async () => {
    mockFetch.mockResolvedValueOnce(make200());

    const response = await breaker.fetch("https://example.com");

    expect(response.status).toBe(200);
    expect(breaker.getState().state).toBe("closed");
    expect(breaker.getState().failureCount).toBe(0);
  });

  it("returns 429 response and increments failure count", async () => {
    mockFetch.mockResolvedValueOnce(make429());

    const response = await breaker.fetch("https://example.com");

    expect(response.status).toBe(429);
    expect(breaker.getState().failureCount).toBe(1);
    expect(breaker.getState().state).toBe("closed");
  });

  it("opens circuit after reaching failure threshold", async () => {
    mockFetch.mockResolvedValue(make429());

    await breaker.fetch("https://example.com");
    await breaker.fetch("https://example.com");

    expect(breaker.getState().state).toBe("open");
    expect(breaker.getState().reopenAt).toBeGreaterThan(Date.now());
  });

  it("throws CircuitOpenError when circuit is open", async () => {
    mockFetch.mockResolvedValue(make429());

    await breaker.fetch("https://example.com");
    await breaker.fetch("https://example.com");

    await expect(breaker.fetch("https://example.com")).rejects.toThrow(
      CircuitOpenError
    );
    // fetch should not have been called a third time
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("uses Retry-After header in seconds", async () => {
    mockFetch.mockResolvedValue(make429("30"));

    await breaker.fetch("https://example.com");
    await breaker.fetch("https://example.com");

    const state = breaker.getState();
    expect(state.state).toBe("open");
    // reopenAt should be ~30s from now (within tolerance)
    const expectedReopen = Date.now() + 30_000;
    expect(state.reopenAt).toBeGreaterThan(expectedReopen - 2000);
    expect(state.reopenAt).toBeLessThan(expectedReopen + 2000);
  });

  it("uses Retry-After header as HTTP date", async () => {
    const futureDate = new Date(Date.now() + 45_000).toUTCString();
    mockFetch.mockResolvedValue(make429(futureDate));

    await breaker.fetch("https://example.com");
    await breaker.fetch("https://example.com");

    const state = breaker.getState();
    expect(state.state).toBe("open");
    const expectedReopen = Date.now() + 45_000;
    expect(state.reopenAt).toBeGreaterThan(expectedReopen - 5000);
    expect(state.reopenAt).toBeLessThan(expectedReopen + 5000);
  });

  it("caps Retry-After at maxCooldownMs", async () => {
    mockFetch.mockResolvedValue(make429("600")); // 10 minutes, max is 5

    await breaker.fetch("https://example.com");
    await breaker.fetch("https://example.com");

    const state = breaker.getState();
    const maxReopen = Date.now() + 300_000;
    expect(state.reopenAt).toBeLessThanOrEqual(maxReopen + 1000);
  });

  it("falls back to exponential backoff without Retry-After", async () => {
    mockFetch.mockResolvedValue(make429());

    await breaker.fetch("https://example.com");
    await breaker.fetch("https://example.com");

    const state = breaker.getState();
    // With 2 failures, backoff = 60000 * 2^(2-1) = 120000ms
    const expectedReopen = Date.now() + 120_000;
    expect(state.reopenAt).toBeGreaterThan(expectedReopen - 2000);
    expect(state.reopenAt).toBeLessThan(expectedReopen + 2000);
  });

  it("transitions to half-open after cooldown expires", async () => {
    const breaker = new CircuitBreaker({
      name: "test",
      failureThreshold: 1,
      defaultCooldownMs: 100,
      maxCooldownMs: 1000,
    });

    mockFetch.mockResolvedValueOnce(make429());
    await breaker.fetch("https://example.com");
    expect(breaker.getState().state).toBe("open");

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 150));

    mockFetch.mockResolvedValueOnce(make200());
    const response = await breaker.fetch("https://example.com");

    expect(response.status).toBe(200);
    expect(breaker.getState().state).toBe("closed");
    expect(breaker.getState().failureCount).toBe(0);
  });

  it("re-opens circuit if probe request also gets 429", async () => {
    const breaker = new CircuitBreaker({
      name: "test",
      failureThreshold: 1,
      defaultCooldownMs: 100,
      maxCooldownMs: 1000,
    });

    mockFetch.mockResolvedValueOnce(make429());
    await breaker.fetch("https://example.com");
    expect(breaker.getState().state).toBe("open");

    await new Promise((r) => setTimeout(r, 150));

    mockFetch.mockResolvedValueOnce(make429());
    await breaker.fetch("https://example.com");
    expect(breaker.getState().state).toBe("open");
  });

  it("resets to initial state", async () => {
    mockFetch.mockResolvedValue(make429());

    await breaker.fetch("https://example.com");
    await breaker.fetch("https://example.com");
    expect(breaker.getState().state).toBe("open");

    breaker.reset();

    expect(breaker.getState()).toEqual({
      state: "closed",
      failureCount: 0,
      reopenAt: 0,
    });
  });

  it("resets failure count on successful response", async () => {
    mockFetch.mockResolvedValueOnce(make429());
    await breaker.fetch("https://example.com");
    expect(breaker.getState().failureCount).toBe(1);

    mockFetch.mockResolvedValueOnce(make200());
    await breaker.fetch("https://example.com");
    expect(breaker.getState().failureCount).toBe(0);
  });
});
