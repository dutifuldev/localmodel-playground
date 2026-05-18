import { isJsonObject, parseJson, type JsonValue } from "../../shared/json";
import type { ParsedRunResponse } from "../../shared/types";
import { adapterById } from "../requests/registry";
import type { ApiShapeId } from "../../shared/types";

export type StreamParseResult = {
  readonly text: string;
  readonly events: readonly JsonValue[];
};

export const parseSseText = (source: string): StreamParseResult => {
  const events: JsonValue[] = [];
  const text = source
    .split(/\n\n+/)
    .flatMap((block) => block.split("\n"))
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, "").trim())
    .filter((line) => line && line !== "[DONE]")
    .map((line) => {
      const parsed = parseJson(line);
      if (parsed.ok) {
        events.push(parsed.value);
        return extractStreamingText(parsed.value);
      }
      return "";
    })
    .join("");

  return { text, events };
};

export const parseNdjsonText = (source: string): StreamParseResult => {
  const events: JsonValue[] = [];
  const text = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = parseJson(line);
      if (parsed.ok) {
        events.push(parsed.value);
        return extractStreamingText(parsed.value);
      }
      return "";
    })
    .join("");

  return { text, events };
};

export const parseFinalResponse = (apiShape: ApiShapeId, value: JsonValue): ParsedRunResponse =>
  adapterById(apiShape).parseResponse(value);

const extractStreamingText = (value: JsonValue): string => {
  if (!isJsonObject(value)) {
    return "";
  }

  if (typeof value.response === "string") {
    return value.response;
  }

  const message = value.message;
  if (isJsonObject(message) && typeof message.content === "string") {
    return message.content;
  }

  const choices = value.choices;
  if (!Array.isArray(choices)) {
    return "";
  }

  return firstChoiceDeltaText(choices);
};

const firstChoiceDeltaText = (choices: readonly JsonValue[]): string => {
  const first = choices.find(isJsonObject);
  const delta = first?.delta;
  if (!isJsonObject(delta)) {
    return "";
  }
  return typeof delta.content === "string" ? delta.content : "";
};
