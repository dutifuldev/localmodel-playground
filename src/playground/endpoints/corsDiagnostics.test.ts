import { describe, expect, it } from "vitest";

import { explainEndpointError } from "./corsDiagnostics";
import { endpointSupportsShape, normalizeBaseUrl } from "./providers";
import { defaultEndpointPresets } from "./providers";

describe("endpoint helpers", () => {
  it("normalizes base URLs and checks shape support", () => {
    const ollama = defaultEndpointPresets[1];
    expect(ollama).toBeDefined();
    if (!ollama) {
      return;
    }
    expect(normalizeBaseUrl("http://localhost:1234/v1///")).toBe("http://localhost:1234/v1");
    expect(endpointSupportsShape(ollama, "ollama.chat.v1")).toBe(true);
    expect(endpointSupportsShape(ollama, "openai.responses.v1")).toBe(false);
  });

  it("explains browser endpoint failures with CORS guidance", () => {
    expect(
      explainEndpointError(new Error("Failed to fetch"), "http://localhost:1234/v1"),
    ).toContain("allows browser CORS requests");
    expect(explainEndpointError("plain failure", "http://localhost")).toBe("plain failure");
  });
});
