import {
  isJsonObject,
  type JsonObject,
  type JsonValue,
  type MutableJsonObject,
} from "../../shared/json";
import type { ApiShapeId } from "../../shared/types";

export type MessageRow = {
  readonly id: string;
  readonly role: string;
  readonly content: string;
};

export type RequestFormState = {
  readonly model: string;
  readonly temperature: number;
  readonly stream: boolean;
  readonly developerMessage: string;
  readonly messages: readonly MessageRow[];
};

export const requestToFormState = (
  apiShape: ApiShapeId,
  request: JsonObject,
): RequestFormState => {
  const model = typeof request.model === "string" ? request.model : "local-model";
  const temperature = readTemperature(request);
  const stream = request.stream === true;
  const source = apiShape === "openai.responses.v1" ? request.input : request.messages;
  const messages = parseMessages(source);
  const developerMessage =
    messages.find((message) => isDeveloperRole(message.role))?.content ?? "";

  return {
    model,
    temperature,
    stream,
    developerMessage,
    messages: messages.filter((message) => !isDeveloperRole(message.role)),
  };
};

export const formStateToRequest = (
  apiShape: ApiShapeId,
  original: JsonObject,
  form: RequestFormState,
): JsonObject => {
  const next: MutableJsonObject = { ...original };
  next.model = form.model;
  next.stream = form.stream;

  if (apiShape.startsWith("ollama")) {
    next.options = writeOllamaOptions(original.options, form.temperature);
  } else {
    next.temperature = form.temperature;
  }

  if (apiShape === "openai.responses.v1") {
    next.input = [...buildMessages(form, "developer")];
    return next;
  }

  if (apiShape === "openai.completions.v1" || apiShape === "ollama.generate.v1") {
    next.prompt = form.messages[0]?.content ?? "";
    return next;
  }

  next.messages = [
    ...buildMessages(form, apiShape.startsWith("openai") ? "developer" : "system"),
  ];
  return next;
};

const readTemperature = (request: JsonObject): number => {
  if (typeof request.temperature === "number") {
    return request.temperature;
  }

  if (isJsonObject(request.options) && typeof request.options.temperature === "number") {
    return request.options.temperature;
  }

  return 0.7;
};

const parseMessages = (value: JsonValue | undefined): readonly MessageRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isJsonObject).map((message, index) => ({
    id: `message_${String(index)}`,
    role: typeof message.role === "string" ? message.role : "user",
    content: readContent(message.content),
  }));
};

const readContent = (value: JsonValue | undefined): string => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter(isJsonObject)
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("");
  }
  return "";
};

const buildMessages = (
  form: RequestFormState,
  developerRole: "developer" | "system",
): readonly JsonObject[] => {
  const rows: JsonObject[] = [];
  if (form.developerMessage.trim()) {
    rows.push({ role: developerRole, content: form.developerMessage });
  }
  rows.push(
    ...form.messages.map((message) => ({ role: message.role, content: message.content })),
  );
  return rows;
};

const writeOllamaOptions = (
  options: JsonValue | undefined,
  temperature: number,
): JsonObject => {
  const base = isJsonObject(options) ? options : {};
  return { ...base, temperature };
};

const isDeveloperRole = (role: string): boolean => role === "developer" || role === "system";
