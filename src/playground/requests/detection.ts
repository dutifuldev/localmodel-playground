import { isJsonObject, type JsonObject, type JsonValue } from "../../shared/json";
import type { ApiShapeId, DetectionResult } from "../../shared/types";
import { adapters } from "./registry";

export type ShapeDetectionSummary = {
  readonly selected: DetectionResult;
  readonly candidates: readonly DetectionResult[];
  readonly ambiguous: boolean;
};

export const detectRequestShape = (value: JsonValue): ShapeDetectionSummary => {
  const unwrapped = unwrapRequestEnvelope(value);
  const explicitShape = explicitApiShape(value);
  const candidates = adapters
    .map((adapter) => adapter.detect(unwrapped))
    .sort((a, b) => b.confidence - a.confidence);

  const explicit = candidates.find((candidate) => candidate.apiShape === explicitShape);
  const selected = explicit ?? candidates[0] ?? fallbackDetection;
  const next = candidates[1];
  const ambiguous =
    selected.confidence > 0 &&
    next !== undefined &&
    selected.confidence - next.confidence < 0.08;

  return { selected, candidates, ambiguous };
};

export const unwrapRequestEnvelope = (value: JsonValue): JsonValue => {
  if (!isJsonObject(value)) {
    return value;
  }

  const request = value.request;
  return isJsonObject(request) && typeof value.apiShape === "string" ? request : value;
};

const explicitApiShape = (value: JsonValue): ApiShapeId | undefined => {
  if (!isJsonObject(value) || typeof value.apiShape !== "string") {
    return undefined;
  }
  return isKnownShape(value.apiShape) ? value.apiShape : undefined;
};

const isKnownShape = (value: string): value is ApiShapeId =>
  adapters.some((adapter) => adapter.id === value);

export const requestModel = (request: JsonObject): string => {
  const model = request.model;
  return typeof model === "string" ? model : "local-model";
};

const fallbackDetection: DetectionResult = {
  apiShape: "openai.chat.completions.v1",
  confidence: 0,
  reasons: ["fallback"],
};
