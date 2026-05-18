import {
  isJsonObject,
  stableStringify,
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
  const stream = readStream(apiShape, request);
  const source = messageSource(apiShape, request);
  const messages = parseMessages(source);
  const developerIndex = messages.findIndex((message) => isDeveloperRole(message.role));
  const developerMessage = developerIndex >= 0 ? (messages[developerIndex]?.content ?? "") : "";

  return {
    model,
    temperature,
    stream,
    developerMessage,
    messages: messages.filter((_, index) => index !== developerIndex),
  };
};

const readStream = (apiShape: ApiShapeId, request: JsonObject): boolean => {
  if (apiShape.startsWith("ollama")) {
    return request.stream !== false;
  }
  return request.stream === true;
};

const messageSource = (apiShape: ApiShapeId, request: JsonObject): JsonValue | undefined => {
  switch (apiShape) {
    case "openai.responses.v1":
      return responsesMessageSource(request);
    case "ollama.generate.v1":
      return ollamaGenerateMessageSource(request);
    case "openai.completions.v1":
      return completionsMessageSource(request);
    default:
      return request.messages;
  }
};

const completionsMessageSource = (request: JsonObject): JsonValue | undefined => {
  if (typeof request.prompt === "string") {
    return [{ role: "user", content: request.prompt }];
  }
  if (Array.isArray(request.prompt)) {
    return request.prompt.map((prompt, index) => ({
      role: "user",
      content: typeof prompt === "string" ? prompt : stableStringify(prompt),
      name: `prompt_${String(index + 1)}`,
    }));
  }
  return request.messages;
};

const responsesMessageSource = (request: JsonObject): JsonValue[] => {
  const input =
    typeof request.input === "string"
      ? [{ role: "user", content: request.input }]
      : messageArray(request.input);
  return prependInstruction("developer", request["instructions"], input);
};

const ollamaGenerateMessageSource = (request: JsonObject): JsonValue[] => {
  const input =
    typeof request.prompt === "string"
      ? [{ role: "user", content: request.prompt }]
      : messageArray(request.messages);
  return prependInstruction("system", request["system"], input);
};

const prependInstruction = (
  role: "developer" | "system",
  content: JsonValue | undefined,
  input: JsonValue[],
): JsonValue[] => {
  return typeof content === "string" && content.trim() ? [{ role, content }, ...input] : input;
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
    return writeResponsesRequest(next, form);
  }

  if (apiShape === "openai.completions.v1" || apiShape === "ollama.generate.v1") {
    return writePromptRequest(next, apiShape, form);
  }

  next.messages = [...buildMessages(form, developerRoleForMessages(apiShape, original))];
  return next;
};

const developerRoleForMessages = (
  apiShape: ApiShapeId,
  original: JsonObject,
): "developer" | "system" => {
  if (apiShape !== "openai.chat.completions.v1") {
    return apiShape.startsWith("openai") ? "developer" : "system";
  }

  const instruction = parseMessages(original.messages).find((message) =>
    isDeveloperRole(message.role),
  );
  return instruction?.role === "developer" ? "developer" : "system";
};

const writeResponsesRequest = (next: MutableJsonObject, form: RequestFormState): JsonObject => {
  const instructions = form.developerMessage.trim();
  if (instructions) {
    next["instructions"] = instructions;
  } else {
    delete next["instructions"];
  }
  next.input = form.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  return next;
};

const writePromptRequest = (
  next: MutableJsonObject,
  apiShape: ApiShapeId,
  form: RequestFormState,
): JsonObject => {
  const isOllamaGenerate = apiShape === "ollama.generate.v1";
  next.prompt = promptFromForm(form, !isOllamaGenerate);
  if (isOllamaGenerate) {
    writeSystem(next, form.developerMessage);
  }
  return next;
};

const writeSystem = (target: MutableJsonObject, value: string): void => {
  const trimmed = value.trim();
  if (trimmed) {
    target["system"] = trimmed;
  } else {
    delete target["system"];
  }
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

const messageArray = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? [...value] : [];

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

const promptFromForm = (form: RequestFormState, includeDeveloper: boolean): string => {
  const developerLine =
    includeDeveloper && form.developerMessage.trim()
      ? [`Developer: ${form.developerMessage}`]
      : [];
  if (developerLine.length === 0 && form.messages.length === 1) {
    return form.messages[0]?.content ?? "";
  }

  return [...developerLine, ...form.messages.map(formatPromptMessage)].join("\n\n");
};

const formatPromptMessage = (message: MessageRow): string =>
  `${message.role.slice(0, 1).toUpperCase()}${message.role.slice(1)}: ${message.content}`;

const writeOllamaOptions = (
  options: JsonValue | undefined,
  temperature: number,
): JsonObject => {
  const base = isJsonObject(options) ? options : {};
  return { ...base, temperature };
};

const isDeveloperRole = (role: string): boolean => role === "developer" || role === "system";
