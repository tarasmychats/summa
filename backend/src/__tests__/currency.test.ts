import { describe, it, expect } from "vitest";
import { normalizeCurrency } from "../currency.js";

describe("normalizeCurrency", () => {
  it("returns standard ISO currencies unchanged with divisor 1", () => {
    expect(normalizeCurrency("USD")).toEqual({ iso: "USD", divisor: 1 });
    expect(normalizeCurrency("EUR")).toEqual({ iso: "EUR", divisor: 1 });
    expect(normalizeCurrency("GBP")).toEqual({ iso: "GBP", divisor: 1 });
    expect(normalizeCurrency("JPY")).toEqual({ iso: "JPY", divisor: 1 });
  });

  it("normalizes GBp (pence) to GBP with divisor 100", () => {
    expect(normalizeCurrency("GBp")).toEqual({ iso: "GBP", divisor: 100 });
  });

  it("normalizes GBX to GBP with divisor 100", () => {
    expect(normalizeCurrency("GBX")).toEqual({ iso: "GBP", divisor: 100 });
    expect(normalizeCurrency("gbx")).toEqual({ iso: "GBP", divisor: 100 });
  });

  it("normalizes ILA (Israeli Agorot) to ILS with divisor 100", () => {
    expect(normalizeCurrency("ILA")).toEqual({ iso: "ILS", divisor: 100 });
  });

  it("normalizes ZAc (South African cents) to ZAR with divisor 100", () => {
    expect(normalizeCurrency("ZAc")).toEqual({ iso: "ZAR", divisor: 100 });
    expect(normalizeCurrency("ZAC")).toEqual({ iso: "ZAR", divisor: 100 });
  });

  it("handles lowercase input by uppercasing", () => {
    expect(normalizeCurrency("usd")).toEqual({ iso: "USD", divisor: 1 });
    expect(normalizeCurrency("eur")).toEqual({ iso: "EUR", divisor: 1 });
  });
});
