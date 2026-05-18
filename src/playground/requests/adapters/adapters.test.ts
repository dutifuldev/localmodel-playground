import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../../shared/json";
import type { ApiShapeId } from "../../../shared/types";
import { defaultEndpointPresets } from "../../endpoints/providers";
import { adapterById } from "../registry";
import { detectOllamaChat } from "./ollamaChat";
import { detectOllamaGenerate } from "./ollamaGenerate";
import { detectOpenAiChatCompletions } from "./openaiChatCompletions";
import { detectOpenAiCompletions } from "./openaiCompletions";
import { detectOpenAiResponses } from "./openaiResponses";
import { parseChatCompletionsResponse } from "./openaiChatCompletions";
import { parseCompletionsResponse } from "./openaiCompletions";
import { parseResponsesResponse } from "./openaiResponses";
import { parseOllamaChatResponse } from "./ollamaChat";
import { parseOllamaGenerateResponse } from "./ollamaGenerate";

describe("API shape adapters", () => {
  it("builds endpoint-specific HTTP requests", () => {
    const lmStudio = defaultEndpointPresets[0];
    const ollama = defaultEndpointPresets[1];
    expect(lmStudio).toBeDefined();
    expect(ollama).toBeDefined();
    if (!lmStudio || !ollama) {
      return;
    }

    expect(
      adapterById("openai.chat.completions.v1").buildHttpRequest({
        endpoint: lmStudio,
        request: { model: "local", messages: [], stream: true },
      }),
    ).toMatchObject({
      url: "http://127.0.0.1:1234/v1/chat/completions",
      streamKind: "sse",
      init: { method: "POST" },
    });

    expect(
      adapterById("openai.completions.v1").buildHttpRequest({
        endpoint: lmStudio,
        request: { model: "local", prompt: "hello", stream: false },
      }),
    ).toMatchObject({
      url: "http://127.0.0.1:1234/v1/completions",
      streamKind: "none",
      init: { method: "POST" },
    });

    expect(
      adapterById("openai.responses.v1").buildHttpRequest({
        endpoint: lmStudio,
        request: { model: "local", input: "hello" },
      }).url,
    ).toBe("http://127.0.0.1:1234/v1/responses");

    expect(
      adapterById("ollama.chat.v1").buildHttpRequest({
        endpoint: ollama,
        request: { model: "llama", messages: [] },
      }).streamKind,
    ).toBe("ndjson");

    expect(
      adapterById("ollama.generate.v1").buildHttpRequest({
        endpoint: ollama,
        request: { model: "llama", prompt: "hello", stream: false },
      }),
    ).toMatchObject({
      url: "http://127.0.0.1:11434/api/generate",
      streamKind: "none",
    });
  });

  it("forwards OpenAI-compatible auth headers for every OpenAI-style shape", () => {
    const endpoint = {
      schemaVersion: 1,
      id: "auth",
      name: "Auth",
      provider: "openai-compatible",
      baseUrl: "http://localhost:9000/v1",
      auth: { type: "bearer", token: "secret", exportable: false },
      modelDiscovery: { type: "manual" },
      supportedShapes: [
        "openai.chat.completions.v1",
        "openai.completions.v1",
        "openai.responses.v1",
      ],
    } as const;

    const shapes: readonly { readonly shape: ApiShapeId; readonly request: JsonObject }[] = [
      { shape: "openai.chat.completions.v1", request: { model: "local", messages: [] } },
      { shape: "openai.completions.v1", request: { model: "local", prompt: "hello" } },
      { shape: "openai.responses.v1", request: { model: "local", input: "hello" } },
    ];

    for (const { shape, request } of shapes) {
      expect(
        adapterById(shape).buildHttpRequest({ endpoint, request }).init.headers,
      ).toMatchObject({
        authorization: "Bearer secret",
        "content-type": "application/json",
      });
    }
  });

  it("parses native provider responses", () => {
    expect(
      parseChatCompletionsResponse({
        choices: [{ message: { content: "chat" }, finish_reason: "stop" }],
      }),
    ).toEqual({ text: "chat", finishReason: "stop" });

    expect(parseCompletionsResponse({ choices: [{ text: "completion" }] })).toEqual({
      text: "completion",
    });

    expect(
      parseResponsesResponse({
        output: [{ content: [{ type: "output_text", text: "response" }] }],
      }),
    ).toEqual({ text: "response" });

    expect(parseOllamaChatResponse({ message: { content: "ollama chat" } })).toEqual({
      text: "ollama chat",
    });

    expect(parseOllamaGenerateResponse({ response: "ollama generate" })).toEqual({
      text: "ollama generate",
    });
  });

  it("covers defaults, detection edge cases, and parse fallbacks", () => {
    expect(adapterById("openai.chat.completions.v1").defaultRequest("model").model).toBe(
      "model",
    );
    expect(adapterById("openai.completions.v1").defaultRequest("model").prompt).toBe(
      "Reply with exactly: pong",
    );
    expect(adapterById("openai.responses.v1").defaultRequest("model").store).toBe(true);
    expect(adapterById("ollama.chat.v1").defaultRequest("model").stream).toBe(true);
    expect(adapterById("ollama.generate.v1").defaultRequest("model").options).toEqual({
      temperature: 0.7,
    });

    expect(detectOpenAiChatCompletions("bad").confidence).toBe(0);
    expect(
      detectOpenAiChatCompletions({
        model: "local",
        messages: [],
        tools: [],
        max_completion_tokens: 100,
      }).reasons,
    ).toContain("has OpenAI token limit field");
    expect(detectOpenAiCompletions({ messages: [] }).confidence).toBe(0.05);
    expect(
      detectOpenAiCompletions({
        model: "local",
        prompt: "hello",
      }).confidence,
    ).toBeGreaterThan(0.7);
    expect(detectOpenAiResponses({}).confidence).toBe(0);
    expect(
      detectOpenAiResponses({
        input: "hello",
        instructions: "be precise",
        reasoning: {},
        text: {},
      }).confidence,
    ).toBeGreaterThan(0.9);
    expect(detectOllamaChat({ prompt: "hello" }).confidence).toBe(0.15);
    expect(detectOllamaChat({ messages: [] }).confidence).toBe(0.45);
    expect(detectOllamaGenerate({}).confidence).toBe(0);
    expect(detectOllamaGenerate({ prompt: "hello", system: "sys" }).confidence).toBeGreaterThan(
      0.7,
    );

    expect(parseChatCompletionsResponse({})).toEqual({ text: "" });
    expect(parseChatCompletionsResponse({ choices: [] })).toEqual({ text: "" });
    expect(
      parseChatCompletionsResponse({ choices: [{ delta: { content: "delta" } }] }),
    ).toEqual({
      text: "delta",
    });
    expect(parseChatCompletionsResponse({ choices: [{ message: { content: 1 } }] })).toEqual({
      text: "",
    });
    expect(parseCompletionsResponse("bad")).toEqual({ text: "" });
    expect(parseCompletionsResponse({ choices: [{}] })).toEqual({ text: "" });
    expect(parseResponsesResponse("bad")).toEqual({ text: "" });
    expect(parseResponsesResponse({ output_text: "flat" })).toEqual({ text: "flat" });
    expect(parseResponsesResponse({ output: [{ content: "bad" }] })).toEqual({ text: "" });
    expect(parseResponsesResponse({})).toEqual({ text: "" });
    expect(parseOllamaChatResponse("bad")).toEqual({ text: "" });
    expect(parseOllamaChatResponse({ response: "fallback" })).toEqual({ text: "fallback" });
    expect(parseOllamaGenerateResponse("bad")).toEqual({ text: "" });
    expect(parseOllamaGenerateResponse({})).toEqual({ text: "" });
  });

  it("throws for unknown registry lookups at runtime", () => {
    expect(() => adapterById("unknown.shape" as never)).toThrow("Unknown API shape");
  });
});
