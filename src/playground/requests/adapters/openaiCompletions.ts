import { isJsonObject, type JsonObject, type JsonValue } from "../../../shared/json";
import type {
  ApiShapeAdapter,
  DetectionResult,
  EndpointPreset,
  HttpRequest,
  ParsedRunResponse,
} from "../../../shared/types";
import { normalizeBaseUrl } from "../../endpoints/providers";
import { openAiRequestHeaders } from "./openaiHeaders";

export const openAiCompletionsAdapter: ApiShapeAdapter = {
  id: "openai.completions.v1",
  label: "Completions",
  defaultRequest: (model) => ({
    model,
    prompt: "Reply with exactly: pong",
    temperature: 0.7,
    max_tokens: 512,
    stream: false,
  }),
  detect: (value) => detectOpenAiCompletions(value),
  buildHttpRequest: ({ endpoint, request }) => buildCompletionsRequest(endpoint, request),
  parseResponse: (response) => parseCompletionsResponse(response),
};

export const detectOpenAiCompletions = (value: JsonValue): DetectionResult => {
  if (!isJsonObject(value)) {
    return { apiShape: "openai.completions.v1", confidence: 0, reasons: [] };
  }

  const reasons: string[] = [];
  if ("prompt" in value) {
    reasons.push("has prompt field");
  }
  if (typeof value.model === "string") {
    reasons.push("has model string");
  }
  if ("messages" in value) {
    return {
      apiShape: "openai.completions.v1",
      confidence: 0.05,
      reasons: ["messages suggests chat"],
    };
  }

  return {
    apiShape: "openai.completions.v1",
    confidence: reasons.length === 0 ? 0 : Math.min(0.9, 0.3 + reasons.length * 0.25),
    reasons,
  };
};

const buildCompletionsRequest = (
  endpoint: EndpointPreset,
  request: JsonObject,
): HttpRequest => ({
  url: `${normalizeBaseUrl(endpoint.baseUrl)}/completions`,
  init: {
    method: "POST",
    headers: openAiRequestHeaders(endpoint),
    body: JSON.stringify(request),
  },
  streamKind: request.stream === true ? "sse" : "none",
});

export const parseCompletionsResponse = (response: JsonValue): ParsedRunResponse => {
  if (!isJsonObject(response) || !Array.isArray(response.choices)) {
    return { text: "" };
  }
  const first = response.choices.find(isJsonObject);
  const text = first && typeof first.text === "string" ? first.text : "";
  return { text };
};
