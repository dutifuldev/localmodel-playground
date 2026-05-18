import { isJsonObject, type JsonValue } from "../../shared/json";
import type { EndpointPreset } from "../../shared/types";
import { openAiRequestHeaders } from "../requests/adapters/openaiHeaders";
import { normalizeBaseUrl } from "./providers";

type ModelDiscoveryResult =
  | { readonly ok: true; readonly models: readonly string[] }
  | { readonly ok: false; readonly message: string };

export const discoverModels = async (
  endpoint: EndpointPreset,
): Promise<ModelDiscoveryResult> => {
  if (endpoint.modelDiscovery.type === "manual") {
    return { ok: true, models: [] };
  }

  const url = `${normalizeBaseUrl(endpoint.baseUrl)}${endpoint.modelDiscovery.path}`;
  try {
    const response = await fetch(url, { headers: openAiRequestHeaders(endpoint) });
    if (!response.ok) {
      return {
        ok: false,
        message: `Model discovery failed with HTTP ${String(response.status)}`,
      };
    }

    const value = (await response.json()) as JsonValue;
    return {
      ok: true,
      models: parseModelList(value, endpoint.modelDiscovery.type),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Model discovery failed",
    };
  }
};

export const parseModelList = (
  value: JsonValue,
  type: "openai-models" | "ollama-tags",
): readonly string[] => {
  if (!isJsonObject(value)) {
    return [];
  }

  const data = value[type === "openai-models" ? "data" : "models"];
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      if (!isJsonObject(item)) {
        return undefined;
      }
      const id = item[type === "openai-models" ? "id" : "name"];
      return typeof id === "string" ? id : undefined;
    })
    .filter((item): item is string => item !== undefined);
};
