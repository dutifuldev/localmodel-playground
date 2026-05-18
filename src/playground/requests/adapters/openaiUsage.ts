import { isJsonObject, type JsonValue } from "../../../shared/json";
import type { RunMetrics } from "../../../shared/types";

export const parseOpenAiUsage = (value: JsonValue | undefined): RunMetrics | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const promptTokens =
    numberValue(value["prompt_tokens"]) ?? numberValue(value["input_tokens"]);
  const completionTokens =
    numberValue(value["completion_tokens"]) ?? numberValue(value["output_tokens"]);
  const totalTokens = numberValue(value["total_tokens"]);
  const metrics: RunMetrics = {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
  return Object.keys(metrics).length > 0 ? metrics : undefined;
};

const numberValue = (value: JsonValue | undefined): number | undefined =>
  typeof value === "number" ? value : undefined;
