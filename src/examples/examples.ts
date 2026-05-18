import type { JsonObject } from "../shared/json";
import type { ApiShapeId } from "../shared/types";

export type ExampleRequest = {
  readonly title: string;
  readonly apiShape: ApiShapeId;
  readonly request: JsonObject;
};

export const examples: readonly ExampleRequest[] = [
  {
    title: "LM Studio chat",
    apiShape: "openai.chat.completions.v1",
    request: {
      model: "local-model",
      messages: [
        { role: "developer", content: "You are concise and precise." },
        { role: "user", content: "Reply with exactly: pong" },
      ],
      temperature: 0.7,
      max_tokens: 256,
      stream: true,
    },
  },
  {
    title: "Ollama chat",
    apiShape: "ollama.chat.v1",
    request: {
      model: "llama3.2",
      messages: [{ role: "user", content: "Reply with exactly: pong" }],
      stream: true,
      options: { temperature: 0.7 },
    },
  },
  {
    title: "vLLM chat",
    apiShape: "openai.chat.completions.v1",
    request: {
      model: "served-model",
      messages: [{ role: "user", content: "Reply with exactly: pong" }],
      temperature: 0.7,
      max_tokens: 256,
      stream: false,
    },
  },
  {
    title: "Responses import",
    apiShape: "openai.responses.v1",
    request: {
      model: "gpt-5.4-mini",
      input: [
        { role: "developer", content: "You are concise and precise." },
        { role: "user", content: "Reply with exactly: pong" },
      ],
      text: { format: { type: "text" }, verbosity: "medium" },
      reasoning: { effort: "medium", summary: "auto" },
      tools: [],
      store: true,
    },
  },
];
