import type { ApiShapeAdapter, ApiShapeId } from "../../shared/types";
import { ollamaChatAdapter } from "./adapters/ollamaChat";
import { ollamaGenerateAdapter } from "./adapters/ollamaGenerate";
import { openAiChatCompletionsAdapter } from "./adapters/openaiChatCompletions";
import { openAiCompletionsAdapter } from "./adapters/openaiCompletions";
import { openAiResponsesAdapter } from "./adapters/openaiResponses";

export const adapters: readonly ApiShapeAdapter[] = [
  openAiChatCompletionsAdapter,
  openAiCompletionsAdapter,
  openAiResponsesAdapter,
  ollamaChatAdapter,
  ollamaGenerateAdapter,
];

export const adapterById = (id: ApiShapeId): ApiShapeAdapter => {
  const adapter = adapters.find((item) => item.id === id);
  if (!adapter) {
    throw new Error(`Unknown API shape: ${id}`);
  }
  return adapter;
};
