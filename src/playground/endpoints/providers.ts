import type { ApiShapeId, EndpointPreset } from "../../shared/types";

const openAiCompatibleShapes: readonly ApiShapeId[] = [
  "openai.chat.completions.v1",
  "openai.completions.v1",
  "openai.responses.v1",
];

export const defaultEndpointPresets: readonly EndpointPreset[] = [
  {
    schemaVersion: 1,
    id: "lmstudio-local",
    name: "LM Studio",
    provider: "lmstudio",
    baseUrl: "http://127.0.0.1:1234/v1",
    auth: { type: "none" },
    modelDiscovery: { type: "openai-models", path: "/models" },
    supportedShapes: ["openai.chat.completions.v1", "openai.completions.v1"],
  },
  {
    schemaVersion: 1,
    id: "ollama-local",
    name: "Ollama",
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    auth: { type: "none" },
    modelDiscovery: { type: "ollama-tags", path: "/api/tags" },
    supportedShapes: ["ollama.chat.v1", "ollama.generate.v1"],
  },
  {
    schemaVersion: 1,
    id: "vllm-local",
    name: "vLLM",
    provider: "vllm",
    baseUrl: "http://127.0.0.1:8000/v1",
    auth: { type: "none" },
    modelDiscovery: { type: "openai-models", path: "/models" },
    supportedShapes: ["openai.chat.completions.v1", "openai.completions.v1"],
  },
  {
    schemaVersion: 1,
    id: "openai-compatible",
    name: "OpenAI-compatible",
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:8000/v1",
    auth: { type: "none" },
    modelDiscovery: { type: "openai-models", path: "/models" },
    supportedShapes: openAiCompatibleShapes,
  },
];

export const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

export const endpointSupportsShape = (endpoint: EndpointPreset, shape: ApiShapeId): boolean =>
  endpoint.supportedShapes.includes(shape);

export const endpointForAppHost = (
  endpoint: EndpointPreset,
  appHost: string,
): EndpointPreset => {
  const baseUrl = endpointBaseUrlForAppHost(endpoint, appHost);
  return baseUrl === endpoint.baseUrl ? endpoint : { ...endpoint, baseUrl };
};

export const endpointBaseUrlForAppHost = (
  endpoint: EndpointPreset,
  appHost: string,
): string => {
  if (isLoopbackHost(appHost) || !isLoopbackEndpoint(endpoint.baseUrl)) {
    return endpoint.baseUrl;
  }

  try {
    const url = new URL(endpoint.baseUrl);
    url.hostname = appHost;
    return url.toString().replace(/\/$/u, "");
  } catch {
    return endpoint.baseUrl;
  }
};

export const isLoopbackHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";

const isLoopbackEndpoint = (baseUrl: string): boolean => {
  try {
    return isLoopbackHost(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
};
