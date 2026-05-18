import { isJsonObject, type JsonObject, type JsonValue } from "../../../shared/json";
import type {
  ApiShapeAdapter,
  DetectionResult,
  EndpointPreset,
  HttpRequest,
  ParsedRunResponse,
} from "../../../shared/types";
import { normalizeBaseUrl } from "../../endpoints/providers";

export const ollamaGenerateAdapter: ApiShapeAdapter = {
  id: "ollama.generate.v1",
  label: "Ollama Generate",
  defaultRequest: (model) => ({
    model,
    prompt: "Reply with exactly: pong",
    stream: true,
    options: { temperature: 0.7 },
  }),
  detect: (value) => detectOllamaGenerate(value),
  buildHttpRequest: ({ endpoint, request }) => buildOllamaGenerateRequest(endpoint, request),
  parseResponse: (response) => parseOllamaGenerateResponse(response),
};

export const detectOllamaGenerate = (value: JsonValue): DetectionResult => {
  if (!isJsonObject(value)) {
    return { apiShape: "ollama.generate.v1", confidence: 0, reasons: [] };
  }

  const reasons: string[] = [];
  if ("prompt" in value) {
    reasons.push("has prompt field");
  }
  if ("system" in value || "template" in value || "context" in value || "options" in value) {
    reasons.push("has Ollama generate fields");
  }

  return {
    apiShape: "ollama.generate.v1",
    confidence: reasons.length === 0 ? 0 : Math.min(0.9, 0.3 + reasons.length * 0.24),
    reasons,
  };
};

const buildOllamaGenerateRequest = (
  endpoint: EndpointPreset,
  request: JsonObject,
): HttpRequest => ({
  url: `${normalizeBaseUrl(endpoint.baseUrl)}/api/generate`,
  init: {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  },
  streamKind: request.stream === false ? "none" : "ndjson",
});

export const parseOllamaGenerateResponse = (response: JsonValue): ParsedRunResponse => {
  if (!isJsonObject(response)) {
    return { text: "" };
  }
  return { text: typeof response.response === "string" ? response.response : "" };
};
