import { isJsonObject, type JsonObject, type JsonValue } from "../../../shared/json";
import type {
  ApiShapeAdapter,
  DetectionResult,
  EndpointPreset,
  HttpRequest,
  ParsedRunResponse,
} from "../../../shared/types";
import { normalizeBaseUrl } from "../../endpoints/providers";

export const openAiChatCompletionsAdapter: ApiShapeAdapter = {
  id: "openai.chat.completions.v1",
  label: "Chat Completions",
  defaultRequest: (model) => ({
    model,
    messages: [
      { role: "developer", content: "You are concise and precise." },
      { role: "user", content: "Reply with exactly: pong" },
    ],
    temperature: 0.7,
    max_tokens: 512,
    stream: true,
  }),
  detect: (value) => detectOpenAiChatCompletions(value),
  buildHttpRequest: ({ endpoint, request }) => buildChatCompletionsRequest(endpoint, request),
  parseResponse: (response) => parseChatCompletionsResponse(response),
};

export const detectOpenAiChatCompletions = (value: JsonValue): DetectionResult => {
  if (!isJsonObject(value)) {
    return { apiShape: "openai.chat.completions.v1", confidence: 0, reasons: [] };
  }

  const reasons = [
    reasonIf(Array.isArray(value.messages), "has messages array"),
    reasonIf(typeof value.model === "string", "has model string"),
    reasonIf(hasAnyKey(value, ["tools", "tool_choice"]), "has OpenAI tool fields"),
    reasonIf(
      hasAnyKey(value, ["max_tokens", "max_completion_tokens"]),
      "has OpenAI token limit field",
    ),
  ].filter(isPresent);

  return {
    apiShape: "openai.chat.completions.v1",
    confidence: reasons.length === 0 ? 0 : Math.min(0.95, 0.35 + reasons.length * 0.18),
    reasons,
  };
};

const hasAnyKey = (value: JsonObject, keys: readonly string[]): boolean =>
  keys.some((key) => key in value);

const reasonIf = (condition: boolean, reason: string): string | undefined =>
  condition ? reason : undefined;

const isPresent = (value: string | undefined): value is string => value !== undefined;

const buildChatCompletionsRequest = (
  endpoint: EndpointPreset,
  request: JsonObject,
): HttpRequest => ({
  url: `${normalizeBaseUrl(endpoint.baseUrl)}/chat/completions`,
  init: {
    method: "POST",
    headers: requestHeaders(endpoint),
    body: JSON.stringify(request),
  },
  streamKind: request.stream === true ? "sse" : "none",
});

const requestHeaders = (endpoint: EndpointPreset): HeadersInit => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (endpoint.auth.type === "bearer" && endpoint.auth.token) {
    headers["authorization"] = `Bearer ${endpoint.auth.token}`;
  }
  if (endpoint.auth.type === "header" && endpoint.auth.headerValue) {
    headers[endpoint.auth.headerName] = endpoint.auth.headerValue;
  }
  return headers;
};

export const parseChatCompletionsResponse = (response: JsonValue): ParsedRunResponse => {
  if (!isJsonObject(response)) {
    return { text: "" };
  }

  const choices = response.choices;
  if (!Array.isArray(choices)) {
    return { text: "" };
  }

  const first = choices.find(isJsonObject);
  if (!first) {
    return { text: "" };
  }

  const message = first.message;
  const delta = first.delta;
  const text = extractContent(message) ?? extractContent(delta) ?? "";
  const finishReason =
    typeof first.finish_reason === "string" ? first.finish_reason : undefined;
  return finishReason ? { text, finishReason } : { text };
};

const extractContent = (value: JsonValue | undefined): string | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  return typeof value.content === "string" ? value.content : undefined;
};
