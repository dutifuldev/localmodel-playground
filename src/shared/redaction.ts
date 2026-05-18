import { isJsonObject, type JsonObject, type JsonValue, type MutableJsonObject } from "./json";

const sensitiveKeyPattern =
  /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|(?:^|[_-])token$|password|secret|cookie|bearer|header[_-]?value)/i;

export const REDACTED = "[redacted]";

export const redactJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(redactJson);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const output: MutableJsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = sensitiveKeyPattern.test(key) ? REDACTED : redactJson(child);
  }
  return output;
};

export const redactEndpointPreset = (preset: JsonObject): JsonObject => {
  const redacted = redactJson(preset);
  return isJsonObject(redacted) ? redacted : {};
};

export const containsSecretLikeKey = (value: JsonValue): boolean => {
  if (Array.isArray(value)) {
    return value.some(containsSecretLikeKey);
  }

  if (!isJsonObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) => {
    if (sensitiveKeyPattern.test(key) && child !== null && child !== REDACTED) {
      return true;
    }
    return containsSecretLikeKey(child);
  });
};
