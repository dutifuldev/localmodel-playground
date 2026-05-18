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
import { parseOpenAiUsage } from "./openaiUsage";

export const openAiResponsesAdapter: ApiShapeAdapter = {
  id: "openai.responses.v1",
  label: "Responses",
  defaultRequest: (model) => ({
    model,
    input: [
      { role: "developer", content: "You are concise and precise." },
      { role: "user", content: "Reply with exactly: pong" },
    ],
    text: { format: { type: "text" }, verbosity: "medium" },
    reasoning: { effort: "medium", summary: "auto" },
    tools: [],
    store: true,
  }),
  detect: (value) => detectOpenAiResponses(value),
  buildHttpRequest: ({ endpoint, request }) => buildResponsesRequest(endpoint, request),
  parseResponse: (response) => parseResponsesResponse(response),
};

export const detectOpenAiResponses = (value: JsonValue): DetectionResult => {
  if (!isJsonObject(value)) {
    return { apiShape: "openai.responses.v1", confidence: 0, reasons: [] };
  }

  const reasons: string[] = [];
  if ("input" in value) {
    reasons.push("has input field");
  }
  if ("instructions" in value) {
    reasons.push("has instructions field");
  }
  if ("reasoning" in value) {
    reasons.push("has reasoning config");
  }
  if ("text" in value) {
    reasons.push("has text config");
  }

  return {
    apiShape: "openai.responses.v1",
    confidence: reasons.length === 0 ? 0 : Math.min(0.96, 0.35 + reasons.length * 0.18),
    reasons,
  };
};

const buildResponsesRequest = (endpoint: EndpointPreset, request: JsonObject): HttpRequest => ({
  url: `${normalizeBaseUrl(endpoint.baseUrl)}/responses`,
  init: {
    method: "POST",
    headers: openAiRequestHeaders(endpoint),
    body: JSON.stringify(request),
  },
  streamKind: request.stream === true ? "sse" : "none",
});

export const parseResponsesResponse = (response: JsonValue): ParsedRunResponse => {
  if (!isJsonObject(response)) {
    return { text: "" };
  }

  if (typeof response.output_text === "string") {
    const usage = parseOpenAiUsage(response["usage"]);
    return { text: response.output_text, ...(usage ? { usage } : {}) };
  }

  if (!Array.isArray(response.output)) {
    const usage = parseOpenAiUsage(response["usage"]);
    return { text: "", ...(usage ? { usage } : {}) };
  }

  const text = response.output
    .filter(isJsonObject)
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter(isJsonObject)
    .map((content) => (typeof content.text === "string" ? content.text : ""))
    .join("");

  const usage = parseOpenAiUsage(response["usage"]);
  return { text, ...(usage ? { usage } : {}) };
};
