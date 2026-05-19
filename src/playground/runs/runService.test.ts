import { afterEach, describe, expect, it, vi } from "vitest";

import type { EndpointPreset } from "../../shared/types";
import { defaultEndpointPresets } from "../endpoints/providers";
import { runRequest } from "./runService";

describe("run service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("executes a non-streaming JSON request and stores parsed output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
          }),
        ),
      ),
    );
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    const run = await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [{ role: "user", content: "ping" }], stream: false },
    });

    expect(run.status).toBe("succeeded");
    expect(run.model).toBe("local");
    expect(run.parsed).toEqual({
      text: "pong",
      finishReason: "stop",
      usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
    });
    expect(run.metrics).toMatchObject({
      promptTokens: 2,
      completionTokens: 1,
      totalTokens: 3,
    });
    expect(run.response).toEqual({
      choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    });
  });

  it("parses streaming SSE responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"po"}}]}\n\ndata: {"choices":[{"delta":{"content":"ng"}}]}\n\n',
          ),
        ),
      ),
    );
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    const run = await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [], stream: true },
    });

    expect(run.status).toBe("succeeded");
    expect(run.parsed?.text).toBe("pong");
    expect(run.response).toEqual({
      events: [
        { choices: [{ delta: { content: "po" } }] },
        { choices: [{ delta: { content: "ng" } }] },
      ],
    });
  });

  it("emits streaming progress before the final run record", async () => {
    const encoder = new TextEncoder();
    let chunks = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                chunks += 1;
                if (chunks === 1) {
                  controller.enqueue(
                    encoder.encode('data: {"choices":[{"delta":{"content":"po"}}]}\n\n'),
                  );
                  return;
                }
                controller.enqueue(
                  encoder.encode('data: {"choices":[{"delta":{"content":"ng"}}]}\n\n'),
                );
                controller.close();
              },
            }),
          ),
        ),
      ),
    );
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    const progress: string[] = [];
    const run = await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [], stream: true },
      runId: "run_progress",
      onProgress: (partial) => {
        expect(partial.id).toBe("run_progress");
        expect(partial.status).toBe("running");
        progress.push(partial.parsed?.text ?? "");
      },
    });

    expect(progress).toEqual(["po", "pong"]);
    expect(run.id).toBe("run_progress");
    expect(run.status).toBe("succeeded");
    expect(run.parsed?.text).toBe("pong");
  });

  it("keeps partial streaming output when a response body is aborted", async () => {
    const encoder = new TextEncoder();
    let chunks = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                chunks += 1;
                if (chunks === 1) {
                  controller.enqueue(
                    encoder.encode('data: {"choices":[{"delta":{"content":"po"}}]}\n\n'),
                  );
                  return;
                }
                controller.error(new DOMException("aborted", "AbortError"));
              },
            }),
          ),
        ),
      ),
    );
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    const run = await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [], stream: true },
    });

    expect(run.status).toBe("cancelled");
    expect(run.parsed?.text).toBe("po");
    expect(run.response).toEqual({ events: [{ choices: [{ delta: { content: "po" } }] }] });
  });

  it("still parses streaming responses without a readable stream fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          body: null,
          text: () =>
            Promise.resolve('data: {"choices":[{"delta":{"content":"fallback"}}]}\n\n'),
        } as Response),
      ),
    );
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    const run = await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [], stream: true },
    });

    expect(run.status).toBe("succeeded");
    expect(run.parsed?.text).toBe("fallback");
  });

  it("measures successful latency after the response body is consumed", async () => {
    const events: string[] = [];
    const now = vi
      .spyOn(performance, "now")
      .mockImplementationOnce(() => {
        events.push("now");
        return 10;
      })
      .mockImplementationOnce(() => {
        events.push("now");
        return 80;
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => {
            events.push("text");
            return Promise.resolve(
              JSON.stringify({ choices: [{ message: { content: "pong" } }] }),
            );
          },
        } as Response),
      ),
    );
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    const run = await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [], stream: false },
    });

    expect(now).toHaveBeenCalledTimes(2);
    expect(events).toEqual(["now", "text", "now"]);
    expect(run.metrics?.latencyMs).toBe(70);
  });

  it("falls back to JSON parsing when a streaming request returns a normal response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            choices: [{ message: { content: "json pong" }, finish_reason: "stop" }],
          }),
        ),
      ),
    );
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    const run = await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [], stream: true },
    });

    expect(run.status).toBe("succeeded");
    expect(run.parsed).toEqual({ text: "json pong", finishReason: "stop" });
  });

  it("returns unsupported, HTTP, and network diagnostics as run records", async () => {
    const lmStudio = defaultEndpointPresets[0];
    expect(lmStudio).toBeDefined();
    if (!lmStudio) {
      return;
    }

    const unsupported = await runRequest({
      endpoint: lmStudio,
      apiShape: "ollama.chat.v1",
      request: { model: "llama", messages: [] },
    });
    expect(unsupported.status).toBe("failed");
    expect(unsupported.error?.kind).toBe("unsupported");

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("Authorization: Bearer local-secret", {
            status: 500,
            statusText: "Server Error",
          }),
        ),
      ),
    );
    const http = await runRequest({
      endpoint: lmStudio,
      apiShape: "openai.completions.v1",
      request: { model: "local", prompt: "hello" },
    });
    expect(http.status).toBe("failed");
    expect(http.error?.message).toContain("HTTP 500");
    expect(http.error?.message).not.toContain("local-secret");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Failed to fetch"))),
    );
    const network = await runRequest({
      endpoint: lmStudio,
      apiShape: "openai.completions.v1",
      request: { model: "local", prompt: "hello" },
    });
    expect(network.error?.kind).toBe("cors");
    expect(network.error?.message).toContain("browser could not reach");
  });

  it("handles text, NDJSON, and aborted requests", async () => {
    const openAi = defaultEndpointPresets[3];
    const ollama = defaultEndpointPresets[1];
    expect(openAi).toBeDefined();
    expect(ollama).toBeDefined();
    if (!openAi || !ollama) {
      return;
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("plain text"))),
    );
    const text = await runRequest({
      endpoint: openAi,
      apiShape: "openai.responses.v1",
      request: { model: "local", input: "hello" },
    });
    expect(text.response).toBeUndefined();
    expect(text.parsed?.text).toBe("plain text");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response('{"response":"ol"}\n{"response":"lama"}\n'))),
    );
    const ndjson = await runRequest({
      endpoint: ollama,
      apiShape: "ollama.generate.v1",
      request: { model: "llama", prompt: "hello" },
    });
    expect(ndjson.parsed?.text).toBe("ollama");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError"))),
    );
    const cancelled = await runRequest({
      endpoint: openAi,
      apiShape: "openai.responses.v1",
      request: { prompt: "no model" },
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.model).toBeUndefined();
  });

  it("passes bearer auth headers for OpenAI-compatible endpoints", async () => {
    const endpoint: EndpointPreset = {
      schemaVersion: 1,
      id: "custom",
      name: "Custom",
      provider: "openai-compatible",
      baseUrl: "http://localhost:9000/v1/",
      auth: { type: "bearer", token: "secret", exportable: false },
      modelDiscovery: { type: "manual" },
      supportedShapes: ["openai.chat.completions.v1"],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit | undefined) => {
      void input;
      void init;
      return Promise.resolve(Response.json({ choices: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await runRequest({
      endpoint,
      apiShape: "openai.chat.completions.v1",
      request: { model: "local", messages: [] },
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toMatchObject({
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
    });
  });
});
