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
