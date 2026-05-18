import { beforeEach, describe, expect, it } from "vitest";

import { createDefaultState } from "./defaults";
import { loadPlaygroundState, savePlaygroundState } from "./storage";

describe("playground storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a default state when nothing valid is stored", () => {
    expect(loadPlaygroundState().schemaVersion).toBe(1);

    localStorage.setItem("localmodel-playground-state-v1", "{");
    expect(loadPlaygroundState().tabs).toHaveLength(1);

    localStorage.setItem("localmodel-playground-state-v1", '{"schemaVersion":2}');
    expect(loadPlaygroundState().schemaVersion).toBe(1);

    localStorage.setItem("localmodel-playground-state-v1", '{"schemaVersion":1}');
    expect(loadPlaygroundState().tabs).toHaveLength(1);
  });

  it("rejects malformed persisted tabs and unresolved endpoint references", () => {
    const valid = createDefaultState();

    localStorage.setItem(
      "localmodel-playground-state-v1",
      JSON.stringify({ ...valid, tabs: [{}] }),
    );
    expect(loadPlaygroundState().tabs[0]?.title).toBe("New prompt");

    localStorage.setItem(
      "localmodel-playground-state-v1",
      JSON.stringify({
        ...valid,
        tabs: [{ ...valid.tabs[0], endpointPresetId: "missing-endpoint" }],
      }),
    );
    expect(loadPlaygroundState().tabs[0]?.endpointPresetId).toBe("lmstudio-local");

    localStorage.setItem(
      "localmodel-playground-state-v1",
      JSON.stringify({ ...valid, activeTabId: "missing-tab" }),
    );
    expect(loadPlaygroundState().activeTabId).not.toBe("missing-tab");

    localStorage.setItem(
      "localmodel-playground-state-v1",
      JSON.stringify({
        ...valid,
        endpointPresets: [{ ...valid.endpointPresets[0], auth: null }],
      }),
    );
    expect(loadPlaygroundState().tabs[0]?.title).toBe("New prompt");
  });

  it("accepts persisted auth, discovery, source, and view variants", () => {
    const valid = createDefaultState();
    const tab = valid.tabs[0];
    const endpoint = valid.endpointPresets[0];
    expect(tab).toBeDefined();
    expect(endpoint).toBeDefined();
    if (!tab || !endpoint) {
      return;
    }

    const state = {
      ...valid,
      activeTabId: "tab_saved",
      endpointPresets: [
        {
          ...endpoint,
          id: "custom-bearer",
          provider: "custom",
          auth: { type: "bearer", token: "local", exportable: false },
          modelDiscovery: { type: "manual" },
          supportedShapes: ["openai.responses.v1"],
        },
        {
          ...endpoint,
          id: "custom-header",
          auth: {
            type: "header",
            headerName: "x-api-key",
            headerValue: "local",
            exportable: false,
          },
        },
      ],
      tabs: [
        {
          ...tab,
          id: "tab_saved",
          endpointPresetId: "custom-bearer",
          apiShape: "openai.responses.v1",
          editorMode: "form",
          source: { kind: "file", fileName: "saved.prompt.json", canSaveBack: false },
          viewState: {
            activePanel: "raw-response",
            sidebarCollapsed: true,
            resultPanelWidth: 360,
          },
        },
      ],
    };

    localStorage.setItem("localmodel-playground-state-v1", JSON.stringify(state));

    expect(loadPlaygroundState().endpointPresets).toHaveLength(2);
    expect(loadPlaygroundState().tabs[0]?.source.kind).toBe("file");
  });

  it("saves and reloads playground state", () => {
    const state = createDefaultState();
    savePlaygroundState(state);

    expect(loadPlaygroundState()).toEqual(state);
  });

  it("does not persist in-flight run state", () => {
    const state = createDefaultState();
    const tab = state.tabs[0];
    expect(tab).toBeDefined();
    if (!tab) {
      return;
    }

    savePlaygroundState({
      ...state,
      tabs: [
        {
          ...tab,
          currentRun: {
            schemaVersion: 1,
            id: "run_pending",
            startedAt: "2026-05-18T00:00:00.000Z",
            endpointPresetId: tab.endpointPresetId,
            apiShape: tab.apiShape,
            requestHash: "pending",
            status: "running",
          },
        },
      ],
    });

    expect(loadPlaygroundState().tabs[0]?.currentRun).toBeUndefined();
  });
});
