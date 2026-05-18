export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  readonly [key: string]: JsonValue;
  readonly apiShape?: JsonValue;
  readonly choices?: JsonValue;
  readonly content?: JsonValue;
  readonly delta?: JsonValue;
  readonly finish_reason?: JsonValue;
  readonly input?: JsonValue;
  readonly message?: JsonValue;
  readonly messages?: JsonValue;
  readonly model?: JsonValue;
  readonly name?: JsonValue;
  readonly options?: JsonValue;
  readonly output?: JsonValue;
  readonly output_text?: JsonValue;
  readonly prompt?: JsonValue;
  readonly request?: JsonValue;
  readonly response?: JsonValue;
  readonly role?: JsonValue;
  readonly schemaVersion?: JsonValue;
  readonly store?: JsonValue;
  readonly stream?: JsonValue;
  readonly tabs?: JsonValue;
  readonly temperature?: JsonValue;
  readonly text?: JsonValue;
};
export type MutableJsonObject = {
  [key: string]: JsonValue;
  apiShape?: JsonValue;
  choices?: JsonValue;
  content?: JsonValue;
  delta?: JsonValue;
  finish_reason?: JsonValue;
  input?: JsonValue;
  message?: JsonValue;
  messages?: JsonValue;
  model?: JsonValue;
  name?: JsonValue;
  options?: JsonValue;
  output?: JsonValue;
  output_text?: JsonValue;
  prompt?: JsonValue;
  request?: JsonValue;
  response?: JsonValue;
  role?: JsonValue;
  schemaVersion?: JsonValue;
  store?: JsonValue;
  stream?: JsonValue;
  tabs?: JsonValue;
  temperature?: JsonValue;
  text?: JsonValue;
};

export type ParseJsonResult =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly message: string };

export const parseJson = (source: string): ParseJsonResult => {
  try {
    return { ok: true, value: JSON.parse(source) as JsonValue };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
};

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getString = (object: JsonObject, key: string): string | undefined => {
  const value = object[key];
  return typeof value === "string" ? value : undefined;
};

export const getBoolean = (object: JsonObject, key: string): boolean | undefined => {
  const value = object[key];
  return typeof value === "boolean" ? value : undefined;
};

export const stableStringify = (value: JsonValue): string =>
  JSON.stringify(sortJson(value), null, 2);

const sortJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const sorted: MutableJsonObject = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJson(value[key] ?? null);
  }
  return sorted;
};

export const jsonHash = async (value: JsonValue): Promise<string> => {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
