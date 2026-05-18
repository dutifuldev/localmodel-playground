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
  if (!parsed.ok || !isJsonObject(parsed.value) || parsed.value.schemaVersion !== 1) {
    return createDefaultState();
  }

  return parsed.value as unknown as PlaygroundState;
};

export const savePlaygroundState = (state: PlaygroundState): void => {
  localStorage.setItem(stateKey, JSON.stringify(state));
};
