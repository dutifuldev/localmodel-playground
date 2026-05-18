import { isJsonObject, type JsonObject, type JsonValue } from "../../../shared/json";
import type {
  ApiShapeAdapter,
  DetectionResult,
  EndpointPreset,
  HttpRequest,
  ParsedRunResponse,
} from "../../../shared/types";
import { normalizeBaseUrl } from "../../endpoints/providers";

export const ollamaChatAdapter: ApiShapeAdapter = {
  id: "ollama.chat.v1",
  label: "Ollama Chat",
  defaultRequest: (model) => ({
    model,
    messages: [{ role: "user", content: "Reply with exactly: pong" }],
    stream: true,
    options: { temperature: 0.7 },
  }),
  detect: (value) => detectOllamaChat(value),
  buildHttpRequest: ({ endpoint, request }) => buildOllamaChatRequest(endpoint, request),
  parseResponse: (response) => parseOllamaChatResponse(response),
};

export const detectOllamaChat = (value: JsonValue): DetectionResult => {
  if (!isJsonObject(value)) {
    return { apiShape: "ollama.chat.v1", confidence: 0, reasons: [] };
  }

  const hasMessages = Array.isArray(value.messages);
  const hasNativeFields = hasAnyKey(value, ["options", "keep_alive", "format"]);
  if ("prompt" in value) {
    return {
      apiShape: "ollama.chat.v1",
      confidence: 0.15,
      reasons: ["prompt suggests generate"],
    };
  }

  const reasons = [
    reasonIf(hasMessages, "has messages array"),
    reasonIf(hasNativeFields, "has Ollama native fields"),
  ].filter(isPresent);

  return {
    apiShape: "ollama.chat.v1",
    confidence:
      reasons.length === 0
        ? 0
        : hasNativeFields
          ? Math.min(0.93, 0.68 + reasons.length * 0.12)
          : 0.45,
    reasons,
  };
};

const hasAnyKey = (value: JsonObject, keys: readonly string[]): boolean =>
  keys.some((key) => key in value);

const reasonIf = (condition: boolean, reason: string): string | undefined =>
  condition ? reason : undefined;

const isPresent = (value: string | undefined): value is string => value !== undefined;

const buildOllamaChatRequest = (
  endpoint: EndpointPreset,
  request: JsonObject,
): HttpRequest => ({
  url: `${normalizeBaseUrl(endpoint.baseUrl)}/api/chat`,
  init: {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  },
  streamKind: request.stream === false ? "none" : "ndjson",
});

export const parseOllamaChatResponse = (response: JsonValue): ParsedRunResponse => {
  if (!isJsonObject(response)) {
    return { text: "" };
  }
  const message = response.message;
  if (isJsonObject(message) && typeof message.content === "string") {
    return { text: message.content };
  }
  return { text: typeof response.response === "string" ? response.response : "" };
};
