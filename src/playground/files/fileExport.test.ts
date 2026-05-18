import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunRecord } from "../../shared/types";
import { createDefaultTab } from "../state/defaults";
import { downloadJson, runRecordFileName, tabToPromptWorkspace } from "./fileExport";

describe("file export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("turns a tab into a versioned prompt workspace", () => {
    const tab = createDefaultTab(1);
    const workspace = tabToPromptWorkspace(tab);

    expect(workspace.schemaVersion).toBe(1);
    expect(workspace.name).toBe(tab.title);
    expect(workspace.tabs).toEqual([tab]);
  });

  it("builds deterministic run record file names", () => {
    expect(runRecordFileName(makeRun("2026-05-18T01:02:03.004Z"))).toBe(
      "2026-05-18T01-02-03-004Z-local.run.json",
    );
  });

  it("downloads redacted JSON through a temporary object URL", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    downloadJson("prompt.json", {
      model: "local",
      api_key: "secret",
    });

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});

const makeRun = (startedAt: string): RunRecord => ({
  schemaVersion: 1,
  id: "run",
  startedAt,
  endpointPresetId: "lmstudio-local",
  apiShape: "openai.chat.completions.v1",
  model: "local",
  requestHash: "hash",
  status: "succeeded",
});
