import { isJsonObject, parseJson } from "../../shared/json";
import type { PlaygroundState } from "../../shared/types";
import { createDefaultState } from "./defaults";

const stateKey = "localmodel-playground-state-v1";

export const loadPlaygroundState = (): PlaygroundState => {
  const source = localStorage.getItem(stateKey);
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
  localStorage.setItem(stateKey, JSON.stringify(persistableState(state)));
};

const persistableState = (state: PlaygroundState): PlaygroundState => ({
  ...state,
  tabs: state.tabs.map((tab) => {
    const { currentRun: _currentRun, ...rest } = tab;
    void _currentRun;
    return rest;
  }),
});

const isStoredPlaygroundState = (value: unknown): value is PlaygroundState => {
  if (!isJsonObject(value) || value.schemaVersion !== 1) {
    return false;
  }
  return (
    typeof value["activeTabId"] === "string" &&
    Array.isArray(value.tabs) &&
    value.tabs.every(isJsonObject) &&
    Array.isArray(value["endpointPresets"]) &&
    value["endpointPresets"].every(isJsonObject)
  );
};
