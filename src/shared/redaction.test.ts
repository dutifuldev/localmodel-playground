import { describe, expect, it } from "vitest";

import { containsSecretLikeKey, redactEndpointPreset, redactJson, REDACTED } from "./redaction";

describe("redaction helpers", () => {
  it("redacts nested secret-like keys", () => {
    const value = {
      headers: {
        Authorization: "Bearer local-secret",
      },
      messages: [{ role: "user", content: "hello" }],
    };

    expect(redactJson(value)).toEqual({
      headers: { Authorization: REDACTED },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(redactJson(["keep", { password: "secret" }])).toEqual([
      "keep",
      { password: REDACTED },
    ]);
  });

  it("detects unredacted secrets and accepts already-redacted values", () => {
    expect(containsSecretLikeKey({ api_key: "sk-local" })).toBe(true);
    expect(containsSecretLikeKey({ accessToken: "token" })).toBe(true);
    expect(containsSecretLikeKey({ refresh_token: "token" })).toBe(true);
    expect(containsSecretLikeKey({ regular: "value" })).toBe(false);
    expect(containsSecretLikeKey({ password: null })).toBe(false);
    expect(containsSecretLikeKey({ api_key: REDACTED })).toBe(false);
    expect(containsSecretLikeKey([{ label: "plain" }, { password: "secret" }])).toBe(true);
    expect(containsSecretLikeKey({ outer: { label: "plain", secret: "value" } })).toBe(true);
  });

  it("redacts endpoint presets while preserving object shape", () => {
    expect(redactEndpointPreset({ auth: { headerValue: "secret" } })).toEqual({
      auth: { headerValue: REDACTED },
    });
  });
});
