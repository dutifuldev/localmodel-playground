import { isJsonObject, parseJson, type JsonObject, type JsonValue } from "../../shared/json";
import type { PlaygroundState } from "../../shared/types";
import { createDefaultState } from "./defaults";

const stateKey = "localmodel-playground-state-v1";

export const loadPlaygroundState = (): PlaygroundState => {
  const source = storedStateSource();
  if (!source) {
    return createDefaultState();
  }

  const parsed = parseJson(source);
  if (!parsed.ok || !isStoredPlaygroundState(parsed.value)) {
    return createDefaultState();
  }

  return parsed.value;
};

export const savePlaygroundState = (state: PlaygroundState): void => {
  if (trySaveState(persistableState(state))) {
    return;
  }
  trySaveState(compactPersistableState(state));
};

const storedStateSource = (): string | null => {
  try {
    return localStorage.getItem(stateKey);
  } catch {
    return null;
  }
};

const trySaveState = (state: PlaygroundState): boolean => {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
};

const persistableState = (state: PlaygroundState): PlaygroundState => ({
  ...state,
  tabs: state.tabs.map((tab) => {
    const { currentRun: _currentRun, ...rest } = tab;
    void _currentRun;
    return rest;
  }),
});

const compactPersistableState = (state: PlaygroundState): PlaygroundState => ({
  ...state,
  tabs: persistableState(state).tabs.map((tab) => {
    const { lastRun: _lastRun, ...rest } = tab;
    void _lastRun;
    return { ...rest, runHistory: [] };
  }),
});

const isStoredPlaygroundState = (value: unknown): value is PlaygroundState => {
  if (!hasStoredStateShape(value)) {
    return false;
  }
  const endpointPresets = readEndpointPresets(value["endpointPresets"]);
  const tabs = readTabs(value.tabs);
  const activeTabId = value["activeTabId"];
  return (
    typeof activeTabId === "string" &&
    validStoredCounts(value, endpointPresets, tabs) &&
    tabs.some((tab) => tab.id === activeTabId) &&
    tabs.every((tab) =>
      endpointPresets.some((endpoint) => endpoint.id === tab.endpointPresetId),
    )
  );
};

const hasStoredStateShape = (value: unknown): value is JsonObject => {
  return (
    isJsonObject(value) &&
    value.schemaVersion === 1 &&
    Array.isArray(value["endpointPresets"]) &&
    Array.isArray(value.tabs)
  );
};

const validStoredCounts = (
  value: JsonObject,
  endpointPresets: readonly EndpointPreset[],
  tabs: readonly PlaygroundTab[],
): boolean =>
  Array.isArray(value["endpointPresets"]) &&
  Array.isArray(value.tabs) &&
  endpointPresets.length > 0 &&
  endpointPresets.length === value["endpointPresets"].length &&
  tabs.length > 0 &&
  tabs.length === value.tabs.length;

const readEndpointPresets = (value: JsonValue | undefined): readonly EndpointPreset[] =>
  Array.isArray(value) ? value.flatMap(readEndpointPreset) : [];

const readTabs = (value: JsonValue | undefined): readonly PlaygroundTab[] =>
  Array.isArray(value) ? value.flatMap(readTab) : [];

type EndpointPreset = { readonly id: string };
type PlaygroundTab = { readonly id: string; readonly endpointPresetId: string };

const readEndpointPreset = (value: JsonValue): readonly EndpointPreset[] => {
  if (!isEndpointPreset(value) || !isJsonObject(value)) {
    return [];
  }
  const id = stringValue(value["id"]);
  return id ? [{ id }] : [];
};

const readTab = (value: JsonValue): readonly PlaygroundTab[] => {
  if (!isPlaygroundTab(value) || !isJsonObject(value)) {
    return [];
  }
  const id = stringValue(value["id"]);
  const endpointPresetId = stringValue(value["endpointPresetId"]);
  return id && endpointPresetId ? [{ id, endpointPresetId }] : [];
};

const isEndpointPreset = (value: JsonValue): boolean => {
  if (!isJsonObject(value) || value.schemaVersion !== 1) {
    return false;
  }
  return (
    hasEndpointIdentity(value) &&
    isAuthConfig(value["auth"]) &&
    isModelDiscovery(value["modelDiscovery"]) &&
    apiShapes(value["supportedShapes"]) > 0
  );
};

const isPlaygroundTab = (value: JsonValue): boolean => {
  if (!isJsonObject(value) || value.schemaVersion !== 1) {
    return false;
  }
  return (
    hasTabIdentity(value) &&
    hasTabRequest(value) &&
    isSourceRef(value["source"]) &&
    isViewState(value["viewState"]) &&
    Array.isArray(value["runHistory"])
  );
};

const hasEndpointIdentity = (value: JsonObject): boolean =>
  stringValue(value["id"]) !== undefined &&
  stringValue(value.name) !== undefined &&
  providerValue(value["provider"]) &&
  stringValue(value["baseUrl"]) !== undefined;

const hasTabIdentity = (value: JsonObject): boolean =>
  stringValue(value["id"]) !== undefined &&
  stringValue(value["title"]) !== undefined &&
  typeof value["dirty"] === "boolean";

const hasTabRequest = (value: JsonObject): boolean =>
  stringValue(value["endpointPresetId"]) !== undefined &&
  stringValue(value.model) !== undefined &&
  apiShapeValue(value.apiShape) &&
  isJsonObject(value.request) &&
  editorModeValue(value["editorMode"]);

const isSourceRef = (value: JsonValue | undefined): boolean =>
  isJsonObject(value) &&
  sourceKindValue(value["kind"]) &&
  typeof value["canSaveBack"] === "boolean";

const isViewState = (value: JsonValue | undefined): boolean =>
  isJsonObject(value) &&
  activePanelValue(value["activePanel"]) &&
  typeof value["sidebarCollapsed"] === "boolean" &&
  typeof value["resultPanelWidth"] === "number";

const isAuthConfig = (value: JsonValue | undefined): boolean => {
  if (!isJsonObject(value)) {
    return false;
  }
  if (value["type"] === "none") {
    return true;
  }
  if (value["type"] === "bearer") {
    return value["exportable"] === false || value["exportable"] === undefined;
  }
  return (
    value["type"] === "header" &&
    stringValue(value["headerName"]) !== undefined &&
    (value["exportable"] === false || value["exportable"] === undefined)
  );
};

const isModelDiscovery = (value: JsonValue | undefined): boolean =>
  isJsonObject(value) &&
  (value["type"] === "manual" ||
    (value["type"] === "openai-models" && value["path"] === "/models") ||
    (value["type"] === "ollama-tags" && value["path"] === "/api/tags"));

const apiShapes = (value: JsonValue | undefined): number =>
  Array.isArray(value) ? value.filter(apiShapeValue).length : 0;

const stringValue = (value: JsonValue | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

const providerValue = (value: JsonValue | undefined): boolean =>
  value === "lmstudio" ||
  value === "ollama" ||
  value === "vllm" ||
  value === "openai-compatible" ||
  value === "custom";

const apiShapeValue = (value: JsonValue | undefined): boolean =>
  value === "openai.chat.completions.v1" ||
  value === "openai.completions.v1" ||
  value === "openai.responses.v1" ||
  value === "ollama.chat.v1" ||
  value === "ollama.generate.v1";

const editorModeValue = (value: JsonValue | undefined): boolean =>
  value === "form" || value === "json" || value === "split";

const activePanelValue = (value: JsonValue | undefined): boolean =>
  value === "conversation" ||
  value === "raw-response" ||
  value === "request-json" ||
  value === "schema";

const sourceKindValue = (value: JsonValue | undefined): boolean =>
  value === "none" ||
  value === "file" ||
  value === "directory" ||
  value === "bundle" ||
  value === "example" ||
  value === "download";
