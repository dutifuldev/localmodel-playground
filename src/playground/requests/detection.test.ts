import { describe, expect, it } from "vitest";

import { detectRequestShape, requestModel, unwrapRequestEnvelope } from "./detection";

describe("request shape detection", () => {
  it("honors explicit request envelopes", () => {
    const envelope = {
      schemaVersion: 1,
      apiShape: "openai.responses.v1",
      request: {
        model: "gpt-local",
        input: [{ role: "user", content: "ping" }],
      },
    };

    expect(unwrapRequestEnvelope(envelope)).toEqual(envelope.request);
    expect(detectRequestShape(envelope).selected.apiShape).toBe("openai.responses.v1");
  });

  it("detects Ollama chat and OpenAI chat requests", () => {
    expect(
      detectRequestShape({
        model: "llama3",
        messages: [{ role: "user", content: "hello" }],
        options: { temperature: 0.2 },
      }).selected.apiShape,
    ).toBe("ollama.chat.v1");

    expect(
      detectRequestShape({
        model: "local-model",
        messages: [{ role: "developer", content: "precise" }],
        temperature: 0.4,
      }).selected.apiShape,
    ).toBe("openai.chat.completions.v1");
  });

  it("falls back to local-model when no model is present", () => {
    expect(requestModel({ prompt: "hello" })).toBe("local-model");
  });
});
