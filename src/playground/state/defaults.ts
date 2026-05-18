import type { JsonObject } from "../../shared/json";
import type { PlaygroundState, PlaygroundTab, SourceRef, ViewState } from "../../shared/types";
import { defaultEndpointPresets, endpointSupportsShape } from "../endpoints/providers";
import { adapterById } from "../requests/registry";

export const defaultViewState: ViewState = {
  activePanel: "conversation",
  sidebarCollapsed: false,
  resultPanelWidth: 480,
};

export const emptySource: SourceRef = {
  kind: "none",
  canSaveBack: false,
};

export const createDefaultTab = (index: number): PlaygroundTab => {
  const endpoint = defaultEndpointPresets[0];
  if (!endpoint) {
    throw new Error("Missing default endpoint");
  }
  const model = "local-model";
  const apiShape = "openai.chat.completions.v1";
  return {
    schemaVersion: 1,
    id: `tab_${String(Date.now())}_${String(index)}`,
    title: index === 1 ? "New prompt" : `Prompt ${String(index)}`,
    dirty: false,
    source: emptySource,
    endpointPresetId: endpoint.id,
    model,
    apiShape,
    request: adapterById(apiShape).defaultRequest(model),
    editorMode: "split",
    viewState: defaultViewState,
    runHistory: [],
  };
};

export const createTabFromRequest = (args: {
  readonly index: number;
  readonly title: string;
  readonly request: JsonObject;
  readonly apiShape: PlaygroundTab["apiShape"];
  readonly source: SourceRef;
  readonly endpointPresetId?: string;
}): PlaygroundTab => {
  const endpoint = selectEndpoint(args.apiShape, args.endpointPresetId);
  if (!endpoint) {
    throw new Error("Missing default endpoint");
  }

  return {
    schemaVersion: 1,
    id: `tab_${String(Date.now())}_${String(args.index)}`,
    title: args.title,
    dirty: false,
    source: args.source,
    endpointPresetId: endpoint.id,
    model: typeof args.request.model === "string" ? args.request.model : "local-model",
    apiShape: args.apiShape,
    request: args.request,
    editorMode: "split",
    viewState: defaultViewState,
    runHistory: [],
  };
};

const selectEndpoint = (
  apiShape: PlaygroundTab["apiShape"],
  endpointPresetId: string | undefined,
) =>
  defaultEndpointPresets.find((preset) => preset.id === endpointPresetId) ??
  defaultEndpointPresets.find((preset) => endpointSupportsShape(preset, apiShape)) ??
  defaultEndpointPresets[0];

export const createDefaultState = (): PlaygroundState => {
  const firstTab = createDefaultTab(1);
  return {
    schemaVersion: 1,
    activeTabId: firstTab.id,
    tabs: [firstTab],
    endpointPresets: defaultEndpointPresets,
    recentSources: [],
  };
};
