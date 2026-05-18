import { isJsonObject, parseJson, type JsonObject, type JsonValue } from "../../shared/json";
import type {
  ApiShapeId,
  ParsedRunResponse,
  PlaygroundTab,
  RunError,
  RunErrorKind,
  RunMetrics,
  RunRecord,
  RunStatus,
  SourceRef,
  ViewState,
} from "../../shared/types";
import { detectRequestShape, unwrapRequestEnvelope } from "../requests/detection";
import { adapters } from "../requests/registry";

export type ImportedRequest = {
  readonly title: string;
  readonly request: JsonObject;
  readonly apiShape: ApiShapeId;
  readonly endpointPresetId?: string;
  readonly source: SourceRef;
  readonly diagnostics: readonly string[];
  readonly tab?: PlaygroundTab;
};

export const importRequestFile = async (
  file: File,
  relativePath?: string,
): Promise<ImportedRequest> => {
  const text = await file.text();
  const parsed = parseJson(text);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  const source = sourceForFile(file, relativePath);
  const workspaceTab = tabFromPromptWorkspace(parsed.value, source);
  if (workspaceTab) {
    return {
      title: workspaceTab.title,
      request: workspaceTab.request,
      apiShape: workspaceTab.apiShape,
      source,
      diagnostics: ["loaded prompt workspace tab"],
      tab: workspaceTab,
    };
  }

  const unwrapped = unwrapRequestEnvelope(parsed.value);
  if (!isJsonObject(unwrapped)) {
    throw new Error("Imported JSON must be an object request.");
  }

  const detection = detectRequestShape(parsed.value);
  const endpointPresetId = readEnvelopeEndpointPresetId(parsed.value);

  return {
    title: file.name.replace(/\.(request|prompt)?\.?json$/u, "") || "Imported request",
    request: unwrapped,
    apiShape: detection.selected.apiShape,
    ...(endpointPresetId ? { endpointPresetId } : {}),
    source,
    diagnostics: detection.selected.reasons,
  };
};

export const importManyFiles = async (
  files: readonly File[],
): Promise<readonly ImportedRequest[]> => {
  const supported = files.filter((file) => file.name.endsWith(".json"));
  return Promise.all(
    supported.map((file) => {
      const fileWithPath = file as File & { readonly webkitRelativePath?: string };
      return importRequestFile(file, fileWithPath.webkitRelativePath);
    }),
  );
};

const sourceForFile = (file: File, relativePath: string | undefined): SourceRef =>
  relativePath
    ? {
        kind: "directory",
        fileName: file.name,
        relativePath,
        canSaveBack: false,
      }
    : {
        kind: "file",
        fileName: file.name,
        canSaveBack: false,
      };

const tabFromPromptWorkspace = (
  value: JsonValue,
  source: SourceRef,
): PlaygroundTab | undefined => {
  if (!isJsonObject(value) || value.schemaVersion !== 1) {
    return undefined;
  }

  const tabs = jsonArray(value.tabs);
  if (!tabs) {
    return undefined;
  }

  for (const tabValue of tabs) {
    const tab = readPromptWorkspaceTab(tabValue, source);
    if (tab) {
      return tab;
    }
  }
  return undefined;
};

const jsonArray = (value: JsonValue | undefined): readonly JsonValue[] | undefined =>
  Array.isArray(value) ? value : undefined;

const readPromptWorkspaceTab = (
  value: JsonValue,
  source: SourceRef,
): PlaygroundTab | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const identity = readTabIdentity(value);
  const request = readTabRequest(value);
  const view = readTabView(value);
  if (!identity || !request || !view) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    id: `tab_${String(Date.now())}`,
    title: identity.title,
    dirty: false,
    source,
    endpointPresetId: identity.endpointPresetId,
    model: request.model,
    apiShape: request.apiShape,
    request: request.request,
    editorMode: view.editorMode,
    viewState: view.viewState,
    ...(view.lastRun ? { lastRun: view.lastRun } : {}),
    runHistory: view.runHistory,
  };
};

const readTabIdentity = (
  value: JsonObject,
): { readonly title: string; readonly endpointPresetId: string } | undefined => {
  const title = stringValue(value["title"]);
  const endpointPresetId = stringValue(value["endpointPresetId"]);
  if (value.schemaVersion !== 1 || !title || !endpointPresetId) {
    return undefined;
  }
  return { title, endpointPresetId };
};

const readTabRequest = (
  value: JsonObject,
):
  | { readonly model: string; readonly apiShape: ApiShapeId; readonly request: JsonObject }
  | undefined => {
  const model = stringValue(value.model);
  const apiShape = apiShapeValue(value.apiShape);
  const request = value.request;
  if (!model || !apiShape || !isJsonObject(request)) {
    return undefined;
  }
  return { model, apiShape, request };
};

const readTabView = (
  value: JsonObject,
):
  | {
      readonly editorMode: PlaygroundTab["editorMode"];
      readonly viewState: ViewState;
      readonly lastRun?: RunRecord;
      readonly runHistory: readonly RunRecord[];
    }
  | undefined => {
  const editorMode = editorModeValue(value["editorMode"]);
  const viewState = readViewState(value["viewState"]);
  const runHistory = readRunHistory(value["runHistory"]);
  if (!editorMode || !viewState || !runHistory) {
    return undefined;
  }
  const lastRun = readRunRecord(value["lastRun"]);
  return { editorMode, viewState, ...(lastRun ? { lastRun } : {}), runHistory };
};

const readViewState = (value: JsonValue | undefined): ViewState | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const activePanel = activePanelValue(value["activePanel"]);
  const sidebarCollapsed = value["sidebarCollapsed"];
  const resultPanelWidth = value["resultPanelWidth"];
  if (
    !activePanel ||
    typeof sidebarCollapsed !== "boolean" ||
    typeof resultPanelWidth !== "number"
  ) {
    return undefined;
  }
  return { activePanel, sidebarCollapsed, resultPanelWidth };
};

const readRunHistory = (value: JsonValue | undefined): readonly RunRecord[] | undefined => {
  const items = jsonArray(value);
  if (!items) {
    return undefined;
  }
  return items.flatMap((item) => {
    const run = readRunRecord(item);
    return run ? [run] : [];
  });
};

const readRunRecord = (value: JsonValue | undefined): RunRecord | undefined => {
  const base = readRunRecordBase(value);
  if (!base || !isJsonObject(value)) {
    return undefined;
  }
  return appendOptionalRunFields(base, value);
};

const appendOptionalRunFields = (base: RunRecord, value: JsonObject): RunRecord => {
  const response = value.response;
  const parsed = readParsedResponse(value["parsed"]);
  const error = readRunError(value["error"]);
  const metrics = readRunMetrics(value["metrics"]);
  const finishedAt = stringValue(value["finishedAt"]);
  const model = stringValue(value.model);
  return {
    ...base,
    ...(finishedAt ? { finishedAt } : {}),
    ...(model ? { model } : {}),
    ...(response !== undefined ? { response } : {}),
    ...(parsed ? { parsed } : {}),
    ...(error ? { error } : {}),
    ...(metrics ? { metrics } : {}),
  };
};

const readRunRecordBase = (value: JsonValue | undefined): RunRecord | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const identity = readRunIdentity(value);
  const request = readRunRequest(value);
  if (!identity || !request) {
    return undefined;
  }
  return { schemaVersion: 1, ...identity, ...request };
};

const readRunIdentity = (
  value: JsonObject,
): { readonly id: string; readonly startedAt: string } | undefined => {
  const id = stringValue(value["id"]);
  const startedAt = stringValue(value["startedAt"]);
  if (value.schemaVersion !== 1 || !id || !startedAt) {
    return undefined;
  }
  return { id, startedAt };
};

const readRunRequest = (
  value: JsonObject,
):
  | {
      readonly endpointPresetId: string;
      readonly apiShape: ApiShapeId;
      readonly requestHash: string;
      readonly status: RunStatus;
    }
  | undefined => {
  const endpointPresetId = stringValue(value["endpointPresetId"]);
  const apiShape = apiShapeValue(value.apiShape);
  const requestHash = stringValue(value["requestHash"]);
  const status = runStatusValue(value["status"]);
  if (!endpointPresetId || !apiShape || !requestHash || !status) {
    return undefined;
  }
  return { endpointPresetId, apiShape, requestHash, status };
};

const readParsedResponse = (value: JsonValue | undefined): ParsedRunResponse | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const text = stringValue(value.text);
  const finishReason = stringValue(value["finishReason"]);
  return text ? { text, ...(finishReason ? { finishReason } : {}) } : undefined;
};

const readRunError = (value: JsonValue | undefined): RunError | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const kind = runErrorKindValue(value["kind"]);
  const message = stringValue(value.message);
  const redacted = value["redacted"];
  if (!kind || !message || typeof redacted !== "boolean") {
    return undefined;
  }
  return { kind, message, redacted };
};

const readRunMetrics = (value: JsonValue | undefined): RunMetrics | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const metrics: Partial<Record<keyof RunMetrics, number>> = {};
  let hasMetrics = false;
  for (const [key, metric] of metricValues(value)) {
    if (metric !== undefined) {
      metrics[key] = metric;
      hasMetrics = true;
    }
  }
  return hasMetrics ? metrics : undefined;
};

const metricValues = (
  value: JsonObject,
): readonly (readonly [keyof RunMetrics, number | undefined])[] => [
  ["latencyMs", numberValue(value["latencyMs"])],
  ["promptTokens", numberValue(value["promptTokens"])],
  ["completionTokens", numberValue(value["completionTokens"])],
  ["totalTokens", numberValue(value["totalTokens"])],
];

const stringValue = (value: JsonValue | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

const editorModeValue = (
  value: JsonValue | undefined,
): PlaygroundTab["editorMode"] | undefined =>
  value === "form" || value === "json" || value === "split" ? value : undefined;

const activePanelValue = (
  value: JsonValue | undefined,
): ViewState["activePanel"] | undefined =>
  value === "conversation" ||
  value === "raw-response" ||
  value === "request-json" ||
  value === "schema"
    ? value
    : undefined;

const runStatusValue = (value: JsonValue | undefined): RunStatus | undefined =>
  value === "running" || value === "succeeded" || value === "failed" || value === "cancelled"
    ? value
    : undefined;

const runErrorKindValue = (value: JsonValue | undefined): RunErrorKind | undefined =>
  value === "cors" ||
  value === "network" ||
  value === "http" ||
  value === "validation" ||
  value === "unsupported" ||
  value === "unknown"
    ? value
    : undefined;

const numberValue = (value: JsonValue | undefined): number | undefined =>
  typeof value === "number" ? value : undefined;

const apiShapeValue = (value: JsonValue | undefined): ApiShapeId | undefined =>
  typeof value === "string" && isKnownShape(value) ? value : undefined;

const isKnownShape = (value: string): value is ApiShapeId =>
  adapters.some((adapter) => adapter.id === value);

const readEnvelopeEndpointPresetId = (value: JsonValue): string | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const endpointPresetId = stringValue(value["endpointPresetId"]);
  const legacyEndpointPresetId = stringValue(value["endpointPreset"]);
  return endpointPresetId ?? legacyEndpointPresetId;
};
