import { describe, expect, it } from "vitest";

import { endpointScopeHint, explainEndpointError } from "./corsDiagnostics";
import {
  endpointBaseUrlForAppHost,
  endpointSupportsShape,
  normalizeBaseUrl,
} from "./providers";
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
    const explanation = explainEndpointError(
      new Error("Failed to fetch"),
      "http://localhost:1234/v1",
    );

    expect(explanation).toContain("allows browser CORS requests");
    expect(explanation).toContain("same device as the browser");
    expect(explainEndpointError("plain failure", "http://localhost")).toBe("plain failure");
  });

  it("warns when a remote app origin is configured with a loopback endpoint", () => {
    expect(endpointScopeHint("100.119.251.79", "http://127.0.0.1:1234/v1")).toContain(
      "browser device",
    );
    expect(endpointScopeHint("localhost", "http://127.0.0.1:1234/v1")).toBeUndefined();
    expect(
      endpointScopeHint("100.119.251.79", "http://100.119.251.79:1234/v1"),
    ).toBeUndefined();
  });

  it("rewrites loopback endpoint presets for remote app hosts", () => {
    const lmStudio = defaultEndpointPresets[0];
    expect(lmStudio).toBeDefined();
    if (!lmStudio) {
      return;
    }

    expect(endpointBaseUrlForAppHost(lmStudio, "100.119.251.79")).toBe(
      "http://100.119.251.79:1234/v1",
    );
    expect(endpointBaseUrlForAppHost(lmStudio, "localhost")).toBe("http://127.0.0.1:1234/v1");
    expect(
      endpointBaseUrlForAppHost(
        { ...lmStudio, baseUrl: "http://127.0.0.1:9000/v1" },
        "100.119.251.79",
      ),
    ).toBe("http://100.119.251.79:9000/v1");
  });
});
