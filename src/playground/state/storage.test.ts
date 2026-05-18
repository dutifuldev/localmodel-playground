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
  });

  it("saves and reloads playground state", () => {
    const state = createDefaultState();
    savePlaygroundState(state);

    expect(loadPlaygroundState()).toEqual(state);
  });
});
