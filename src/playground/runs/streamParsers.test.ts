import { describe, expect, it } from "vitest";

import { parseFinalResponse, parseNdjsonText, parseSseText } from "./streamParsers";

describe("stream parsers", () => {
  it("extracts text and events from OpenAI-compatible SSE chunks", () => {
    const parsed = parseSseText(
      [
        'data: {"choices":[{"delta":{"content":"hel"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":"lo"}}]}',
        "",
        "data: [DONE]",
      ].join("\n"),
    );

    expect(parsed.text).toBe("hello");
    expect(parsed.events).toHaveLength(2);
  });

  it("ignores invalid streaming chunks", () => {
    expect(parseSseText("event: ping\n\ndata: not-json\n\n").text).toBe("");
    expect(parseNdjsonText("not-json\n").events).toEqual([]);
  });

  it("extracts OpenAI completions and Responses streaming deltas", () => {
    const completions = parseSseText(
      ['data: {"choices":[{"text":"hel"}]}', "", 'data: {"choices":[{"text":"lo"}]}'].join(
        "\n",
      ),
    );
    const responses = parseSseText(
      [
        'data: {"type":"response.output_text.delta","delta":"hi "}',
        "",
        'data: {"type":"response.output_text.delta","delta":"there"}',
      ].join("\n"),
    );

    expect(completions.text).toBe("hello");
    expect(responses.text).toBe("hi there");
  });

  it("extracts text from Ollama NDJSON chunks", () => {
    const parsed = parseNdjsonText(
      ['{"message":{"content":"hi "}}', '{"response":"there"}', '{"done":true}'].join("\n"),
    );

    expect(parsed.text).toBe("hi there");
    expect(parsed.events).toHaveLength(3);
  });

  it("delegates final parsing to the selected API adapter", () => {
    expect(
      parseFinalResponse("openai.chat.completions.v1", {
        choices: [{ message: { content: "done" }, finish_reason: "stop" }],
      }),
    ).toEqual({ text: "done", finishReason: "stop" });
  });
});
