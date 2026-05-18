import type { JsonObject } from "../../shared/json";
import type {
  ApiShapeId,
  PlaygroundState,
  PlaygroundTab,
  RunRecord,
  SourceRef,
} from "../../shared/types";
import { createDefaultTab, createTabFromRequest } from "./defaults";

export type PlaygroundAction =
  | { readonly type: "add-tab" }
  | { readonly type: "close-tab"; readonly tabId: string }
  | { readonly type: "duplicate-tab"; readonly tabId: string }
  | { readonly type: "activate-tab"; readonly tabId: string }
  | {
      readonly type: "update-tab";
      readonly tabId: string;
      readonly patch: Partial<PlaygroundTab>;
    }
  | {
      readonly type: "open-request";
      readonly title: string;
      readonly request: JsonObject;
      readonly apiShape: ApiShapeId;
      readonly source: SourceRef;
    }
  | { readonly type: "open-tab"; readonly tab: PlaygroundTab }
  | { readonly type: "record-run"; readonly tabId: string; readonly run: RunRecord };

export const playgroundReducer = (
  state: PlaygroundState,
  action: PlaygroundAction,
): PlaygroundState =>
  action.type === "open-tab" ? openTab(state, action.tab) : reduceBaseAction(state, action);

type BaseAction = Exclude<PlaygroundAction, { readonly type: "open-tab" }>;

const reduceBaseAction = (state: PlaygroundState, action: BaseAction): PlaygroundState => {
  switch (action.type) {
    case "add-tab": {
      const tab = createDefaultTab(state.tabs.length + 1);
      return { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id };
    }
    case "close-tab":
      return closeTab(state, action.tabId);
    case "duplicate-tab":
      return duplicateTab(state, action.tabId);
    case "activate-tab":
      return { ...state, activeTabId: action.tabId };
    case "update-tab":
      return updateTab(state, action.tabId, action.patch);
    case "open-request": {
      const tab = createTabFromRequest({ ...action, index: state.tabs.length + 1 });
      return { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id };
    }
    case "record-run":
      return recordRun(state, action.tabId, action.run);
  }
};

const openTab = (state: PlaygroundState, tab: PlaygroundTab): PlaygroundState => ({
  ...state,
  tabs: [...state.tabs, tab],
  activeTabId: tab.id,
});

const closeTab = (state: PlaygroundState, tabId: string): PlaygroundState => {
  if (state.tabs.length === 1) {
    return state;
  }

  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId =
    state.activeTabId === tabId ? (tabs[0]?.id ?? state.activeTabId) : state.activeTabId;
  return { ...state, tabs, activeTabId };
};

const duplicateTab = (state: PlaygroundState, tabId: string): PlaygroundState => {
  const source = state.tabs.find((tab) => tab.id === tabId);
  if (!source) {
    return state;
  }

  const copy: PlaygroundTab = {
    ...source,
    id: `tab_${String(Date.now())}`,
    title: `${source.title} copy`,
    dirty: true,
    source: { kind: "none", canSaveBack: false },
  };
  return { ...state, tabs: [...state.tabs, copy], activeTabId: copy.id };
};

const updateTab = (
  state: PlaygroundState,
  tabId: string,
  patch: Partial<PlaygroundTab>,
): PlaygroundState => ({
  ...state,
  tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
});

const recordRun = (state: PlaygroundState, tabId: string, run: RunRecord): PlaygroundState => ({
  ...state,
  tabs: state.tabs.map((tab) => {
    if (tab.id !== tabId) {
      return tab;
    }

    const nextTab: PlaygroundTab = {
      schemaVersion: tab.schemaVersion,
      id: tab.id,
      title: tab.title,
      dirty: tab.dirty,
      source: tab.source,
      endpointPresetId: tab.endpointPresetId,
      model: tab.model,
      apiShape: tab.apiShape,
      request: tab.request,
      editorMode: tab.editorMode,
      viewState: tab.viewState,
      lastRun: run,
      runHistory: [...tab.runHistory, run],
    };
    return nextTab;
  }),
});
