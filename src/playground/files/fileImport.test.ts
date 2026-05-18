import { describe, expect, it } from "vitest";

import { importManyFiles, importRequestFile } from "./fileImport";

describe("file import", () => {
  it("loads a single request file and detects its API shape", async () => {
    const file = textFile(
      JSON.stringify({
        apiShape: "openai.responses.v1",
        endpointPresetId: "openai-compatible",
        request: {
          model: "local",
          input: [{ role: "user", content: "ping" }],
        },
      }),
      "responses.request.json",
    );

    await expect(importRequestFile(file)).resolves.toMatchObject({
      title: "responses",
      apiShape: "openai.responses.v1",
      endpointPresetId: "openai-compatible",
      request: {
        model: "local",
        input: [{ role: "user", content: "ping" }],
      },
      source: { kind: "file", fileName: "responses.request.json", canSaveBack: false },
    });
  });

  it("filters non-json files during multi-file imports", async () => {
    const json = textFile('{"model":"local","prompt":"hello"}', "prompt.json");
    const badJson = textFile("{", "bad.json");
    const text = textFile("not json", "notes.txt", "text/plain");

    const imported = await importManyFiles([json, badJson, text]);

    expect(imported).toHaveLength(1);
    expect(imported[0]?.title).toBe("prompt");
  });

  it("round-trips saved prompt workspace files as self-contained tabs", async () => {
    const file = textFile(
      JSON.stringify({
        schemaVersion: 1,
        name: "Saved workspace",
        activeTabId: "tab_saved",
        tabs: [
          {
            schemaVersion: 1,
            id: "tab_saved",
            title: "Saved prompt",
            dirty: true,
            source: { kind: "none", canSaveBack: false },
            endpointPresetId: "ollama-local",
            model: "llama3",
            apiShape: "ollama.chat.v1",
            request: {
              model: "llama3",
              messages: [{ role: "user", content: "hello" }],
            },
            editorMode: "split",
            viewState: {
              activePanel: "conversation",
              sidebarCollapsed: false,
              resultPanelWidth: 480,
            },
            currentRun: {
              schemaVersion: 1,
              id: "run_running",
              startedAt: "2026-05-18T00:00:00.000Z",
              endpointPresetId: "ollama-local",
              apiShape: "ollama.chat.v1",
              requestHash: "pending",
              status: "running",
            },
            lastRun: {
              schemaVersion: 1,
              id: "run_done",
              startedAt: "2026-05-18T00:00:00.000Z",
              endpointPresetId: "ollama-local",
              apiShape: "ollama.chat.v1",
              requestHash: "abc",
              status: "failed",
              error: { kind: "http", message: "HTTP 500", redacted: true },
              metrics: { latencyMs: 120, promptTokens: 3, completionTokens: 4, totalTokens: 7 },
            },
            runHistory: [],
          },
        ],
      }),
      "saved.prompt.json",
    );

    const imported = await importRequestFile(file);

    expect(imported).toMatchObject({
      title: "Saved prompt",
      apiShape: "ollama.chat.v1",
      request: {
        model: "llama3",
        messages: [{ role: "user", content: "hello" }],
      },
      source: { kind: "file", fileName: "saved.prompt.json", canSaveBack: false },
      tab: {
        title: "Saved prompt",
        dirty: false,
        endpointPresetId: "ollama-local",
        model: "llama3",
        apiShape: "ollama.chat.v1",
        lastRun: {
          status: "failed",
          error: { kind: "http", message: "HTTP 500", redacted: true },
          metrics: { latencyMs: 120, promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        },
      },
    });
    expect(imported.tab?.currentRun).toBeUndefined();
    expect(imported.tab?.id).not.toBe("tab_saved");
  });

  it("loads workspace tabs without a last run and filters invalid run history items", async () => {
    const file = textFile(
      JSON.stringify({
        schemaVersion: 1,
        name: "Saved workspace",
        tabs: [
          {
            ...workspaceTab(),
            lastRun: undefined,
            runHistory: [
              "bad",
              {
                schemaVersion: 1,
                id: "run_kept",
                startedAt: "2026-05-18T00:00:00.000Z",
                endpointPresetId: "lmstudio-local",
                apiShape: "openai.chat.completions.v1",
                requestHash: "abc",
                status: "succeeded",
              },
            ],
          },
        ],
      }),
      "saved.prompt.json",
    );

    const imported = await importRequestFile(file);

    expect(imported.tab?.lastRun).toBeUndefined();
    expect(imported.tab?.runHistory).toHaveLength(1);
    expect(imported.tab?.runHistory[0]?.id).toBe("run_kept");
  });

  it("falls back to raw request import when prompt workspace tabs are invalid", async () => {
    const invalidWorkspaces = [
      { schemaVersion: 1, name: "bad", tabs: ["not a tab"] },
      { schemaVersion: 1, name: "bad", tabs: [{ ...workspaceTab(), title: "" }] },
      {
        schemaVersion: 1,
        name: "bad",
        tabs: [{ ...workspaceTab(), request: [], runHistory: undefined }],
      },
      {
        schemaVersion: 1,
        name: "bad",
        tabs: [{ ...workspaceTab(), viewState: { activePanel: "nope" } }],
      },
    ];

    for (const [index, workspace] of invalidWorkspaces.entries()) {
      const imported = await importRequestFile(
        textFile(JSON.stringify(workspace), `bad-${String(index)}.prompt.json`),
      );
      expect(imported.tab).toBeUndefined();
      expect(imported.request).toMatchObject({ schemaVersion: 1, name: "bad" });
    }
  });

  it("rejects non-object JSON imports", async () => {
    const file = textFile("[]", "bad.json");

    await expect(importRequestFile(file)).rejects.toThrow(
      "Imported JSON must be an object request.",
    );
  });
});

const textFile = (source: string, name: string, type = "application/json"): File => {
  const file = new File([source], name, { type });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(source),
  });
  return file;
};

const workspaceTab = () => ({
  schemaVersion: 1,
  id: "tab_saved",
  title: "Saved prompt",
  dirty: true,
  source: { kind: "none", canSaveBack: false },
  endpointPresetId: "lmstudio-local",
  model: "local-model",
  apiShape: "openai.chat.completions.v1",
  request: {
    model: "local-model",
    messages: [{ role: "user", content: "hello" }],
  },
  editorMode: "split",
  viewState: {
    activePanel: "conversation",
    sidebarCollapsed: false,
    resultPanelWidth: 480,
  },
  runHistory: [],
});
