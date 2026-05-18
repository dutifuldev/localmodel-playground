import { stableStringify, type JsonObject, type JsonValue } from "../../shared/json";
import { redactJson } from "../../shared/redaction";
import type { PlaygroundTab, RunRecord } from "../../shared/types";

export const downloadJson = (fileName: string, value: JsonValue): void => {
  const blob = new Blob([`${stableStringify(redactJson(value))}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const tabToPromptWorkspace = (tab: PlaygroundTab): JsonObject => ({
  $schema: "https://dutiful.dev/localmodel-playground/schemas/prompt-workspace.v1.schema.json",
  schemaVersion: 1,
  name: tab.title,
  activeTabId: tab.id,
  tabs: [tab as unknown as JsonObject],
});

export const runRecordFileName = (run: RunRecord): string =>
  `${run.startedAt.replace(/[:.]/gu, "-")}-${run.model ?? "local-model"}.run.json`;
