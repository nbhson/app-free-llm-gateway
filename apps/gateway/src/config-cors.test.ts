import { describe, it, expect, afterEach } from "vitest";
import { resolveCorsOrigin } from "./config.js";

/**
 * CORS_ORIGIN fail-fast: production + "*" must throw; wildcard stays allowed
 * in development so local dev behavior is preserved.
 */
describe("config resolveCorsOrigin", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  });

  it("throws when NODE_ENV=production and origin is * (fail-fast)", () => {
    expect(() => resolveCorsOrigin("*", "production")).toThrow(/CORS_ORIGIN/);
  });

  it("keeps wildcard in development (local dev behavior preserved)", () => {
    expect(resolveCorsOrigin("*", "development")).toBe("*");
    expect(resolveCorsOrigin(undefined, undefined)).toBe("*");
  });

  it("explicit origin allowed in production", () => {
    expect(resolveCorsOrigin("https://dashboard.example.com", "production")).toBe(
      "https://dashboard.example.com",
    );
  });
});
