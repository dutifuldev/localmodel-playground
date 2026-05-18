import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultEndpointPresets } from "./providers";
import { discoverModels, parseModelList } from "./modelDiscovery";

describe("model discovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses OpenAI-compatible and Ollama model lists", () => {
    expect(
      parseModelList({ data: [{ id: "local-a" }, { id: "local-b" }] }, "openai-models"),
    ).toEqual(["local-a", "local-b"]);
    expect(parseModelList({ models: [{ name: "llama3" }] }, "ollama-tags")).toEqual(["llama3"]);
    expect(parseModelList({ data: ["bad"] }, "openai-models")).toEqual([]);
    expect(parseModelList([], "openai-models")).toEqual([]);
    expect(parseModelList({}, "ollama-tags")).toEqual([]);
  });

  it("discovers models from a configured endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: [{ id: "lmstudio-model" }],
          }),
        ),
      ),
    );

    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    await expect(discoverModels(endpoint)).resolves.toEqual({
      ok: true,
      models: ["lmstudio-model"],
    });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:1234/v1/models", {
      headers: { "content-type": "application/json" },
    });
  });

  it("includes endpoint auth headers during discovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: [{ id: "private-model" }],
          }),
        ),
      ),
    );

    const endpoint = defaultEndpointPresets[3];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    await expect(
      discoverModels({
        ...endpoint,
        auth: { type: "bearer", token: "token-123", exportable: false },
      }),
    ).resolves.toEqual({
      ok: true,
      models: ["private-model"],
    });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8000/v1/models", {
      headers: {
        authorization: "Bearer token-123",
        "content-type": "application/json",
      },
    });
  });

  it("supports manual discovery and thrown fetch failures", async () => {
    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    await expect(
      discoverModels({
        ...endpoint,
        modelDiscovery: { type: "manual" },
      }),
    ).resolves.toEqual({ ok: true, models: [] });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("connection refused"))),
    );
    await expect(discoverModels(endpoint)).resolves.toEqual({
      ok: false,
      message: "connection refused",
    });
  });

  it("returns diagnostics for failed discovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))),
    );

    const endpoint = defaultEndpointPresets[0];
    expect(endpoint).toBeDefined();
    if (!endpoint) {
      return;
    }

    await expect(discoverModels(endpoint)).resolves.toEqual({
      ok: false,
      message: "Model discovery failed with HTTP 500",
    });
  });
});
