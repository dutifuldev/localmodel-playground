import { describe, expect, it } from "vitest";

import type { RunRecord } from "../../shared/types";
import { createDefaultState } from "./defaults";
import { playgroundReducer } from "./reducer";

const makeRun = (id: string): RunRecord => ({
  schemaVersion: 1,
  id,
  startedAt: "2026-05-18T00:00:00.000Z",
  finishedAt: "2026-05-18T00:00:01.000Z",
  endpointPresetId: "lmstudio-local",
  apiShape: "openai.chat.completions.v1",
  model: "local-model",
  requestHash: "hash",
  status: "succeeded",
  parsed: { text: "pong" },
});

describe("playground reducer", () => {
  it("creates, activates, duplicates, and closes self-contained tabs", () => {
    const initial = createDefaultState();
    const added = playgroundReducer(initial, { type: "add-tab" });

    expect(added.tabs).toHaveLength(2);
    expect(added.activeTabId).toBe(added.tabs[1]?.id);

    const firstTab = added.tabs[0];
    expect(firstTab).toBeDefined();
    if (!firstTab) {
      return;
    }

    const duplicated = playgroundReducer(added, { type: "duplicate-tab", tabId: firstTab.id });
    expect(duplicated.tabs).toHaveLength(3);
    expect(duplicated.tabs[2]?.title).toContain("copy");

    const closed = playgroundReducer(duplicated, {
      type: "close-tab",
      tabId: duplicated.activeTabId,
    });
    expect(closed.tabs).toHaveLength(2);
    expect(closed.activeTabId).toBe(closed.tabs[0]?.id);
  });

  it("opens imported requests and stores completed run details on the owning tab", () => {
    const initial = createDefaultState();
    const opened = playgroundReducer(initial, {
      type: "open-request",
      title: "imported",
      apiShape: "openai.responses.v1",
      request: { model: "local", input: [{ role: "user", content: "ping" }] },
      source: { kind: "file", fileName: "imported.json", canSaveBack: false },
    });
    const active = opened.tabs.find((tab) => tab.id === opened.activeTabId);
    expect(active?.title).toBe("imported");

    const pending = makeRun("run_pending");
    const withPending = playgroundReducer(opened, {
      type: "update-tab",
      tabId: opened.activeTabId,
      patch: { currentRun: { ...pending, status: "running" } },
    });
    expect(
      withPending.tabs.find((tab) => tab.id === opened.activeTabId)?.currentRun?.status,
    ).toBe("running");

    const recorded = playgroundReducer(withPending, {
      type: "record-run",
      tabId: opened.activeTabId,
      run: makeRun("run_done"),
    });
    const recordedTab = recorded.tabs.find((tab) => tab.id === opened.activeTabId);

    expect(recordedTab?.currentRun).toBeUndefined();
    expect(recordedTab?.lastRun?.id).toBe("run_done");
    expect(recordedTab?.runHistory).toHaveLength(1);
  });
});
