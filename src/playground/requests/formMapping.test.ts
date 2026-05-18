import { describe, expect, it } from "vitest";

import { formStateToRequest, requestToFormState } from "./formMapping";

describe("request form mapping", () => {
  it("round-trips OpenAI chat messages with developer instructions", () => {
    const request = {
      model: "local-chat",
      temperature: 0.3,
      stream: true,
      messages: [
        { role: "developer", content: "Be terse." },
        { role: "user", content: "Ping" },
      ],
    };

    const form = requestToFormState("openai.chat.completions.v1", request);

    expect(form).toMatchObject({
      model: "local-chat",
      temperature: 0.3,
      stream: true,
      developerMessage: "Be terse.",
    });
    expect(form.messages).toEqual([{ id: "message_1", role: "user", content: "Ping" }]);

    expect(formStateToRequest("openai.chat.completions.v1", request, form)).toMatchObject({
      model: "local-chat",
      temperature: 0.3,
      stream: true,
      messages: [
        { role: "developer", content: "Be terse." },
        { role: "user", content: "Ping" },
      ],
    });
  });

  it("preserves additional system and developer messages during structured edits", () => {
    const request = {
      model: "local-chat",
      messages: [
        { role: "developer", content: "Primary developer." },
        { role: "system", content: "Secondary system." },
        { role: "user", content: "Ping" },
        { role: "developer", content: "Extra developer." },
      ],
    };

    const form = requestToFormState("openai.chat.completions.v1", request);

    expect(form.developerMessage).toBe("Primary developer.");
    expect(form.messages).toEqual([
      { id: "message_1", role: "system", content: "Secondary system." },
      { id: "message_2", role: "user", content: "Ping" },
      { id: "message_3", role: "developer", content: "Extra developer." },
    ]);
    expect(formStateToRequest("openai.chat.completions.v1", request, form).messages).toEqual([
      { role: "developer", content: "Primary developer." },
      { role: "system", content: "Secondary system." },
      { role: "user", content: "Ping" },
      { role: "developer", content: "Extra developer." },
    ]);
  });

  it("maps Responses input and Ollama options to their native request fields", () => {
    const responses = formStateToRequest(
      "openai.responses.v1",
      { model: "local", input: [] },
      {
        model: "local",
        temperature: 0.7,
        stream: false,
        developerMessage: "Use JSON.",
        messages: [{ id: "message_0", role: "user", content: "Make a plan" }],
      },
    );
    expect(responses.input).toEqual([
      { role: "developer", content: "Use JSON." },
      { role: "user", content: "Make a plan" },
    ]);

    const ollama = formStateToRequest(
      "ollama.generate.v1",
      { model: "llama", prompt: "", options: { top_p: 0.9 } },
      {
        model: "llama",
        temperature: 0.1,
        stream: false,
        developerMessage: "",
        messages: [{ id: "message_0", role: "user", content: "Say hi" }],
      },
    );
    expect(ollama.prompt).toBe("Say hi");
    expect(ollama.options).toEqual({ top_p: 0.9, temperature: 0.1 });
  });

  it("preserves scalar Responses input through structured edits", () => {
    const form = requestToFormState("openai.responses.v1", {
      model: "local",
      input: "Keep this response prompt",
    });

    expect(form.messages).toEqual([
      { id: "message_0", role: "user", content: "Keep this response prompt" },
    ]);
    expect(
      formStateToRequest(
        "openai.responses.v1",
        { model: "local", input: "Keep this response prompt" },
        { ...form, model: "changed" },
      ).input,
    ).toEqual([{ role: "user", content: "Keep this response prompt" }]);
  });

  it("preserves prompt text for prompt-based APIs when form fields change", () => {
    const completionsForm = requestToFormState("openai.completions.v1", {
      model: "local",
      prompt: "Keep this prompt",
    });
    expect(completionsForm.messages).toEqual([
      { id: "message_0", role: "user", content: "Keep this prompt" },
    ]);
    expect(
      formStateToRequest(
        "openai.completions.v1",
        { model: "local", prompt: "Keep this prompt" },
        {
          ...completionsForm,
          model: "changed",
        },
      ).prompt,
    ).toBe("Keep this prompt");

    const ollamaForm = requestToFormState("ollama.generate.v1", {
      model: "llama",
      prompt: "Generate this",
    });
    expect(ollamaForm.messages[0]?.content).toBe("Generate this");
    expect(ollamaForm.stream).toBe(true);
    expect(
      formStateToRequest(
        "ollama.generate.v1",
        { model: "llama", prompt: "Generate this" },
        {
          ...ollamaForm,
          model: "changed",
        },
      ).stream,
    ).toBe(true);
  });

  it("folds prompt-api structured fields into native prompt fields", () => {
    const completion = formStateToRequest(
      "openai.completions.v1",
      { model: "local", prompt: "" },
      {
        model: "local",
        temperature: 0.2,
        stream: false,
        developerMessage: "Follow policy.",
        messages: [
          { id: "message_0", role: "user", content: "Draft" },
          { id: "message_1", role: "assistant", content: "Previous answer" },
        ],
      },
    );
    expect(completion.prompt).toContain("Developer: Follow policy.");
    expect(completion.prompt).toContain("User: Draft");
    expect(completion.prompt).toContain("Assistant: Previous answer");

    const ollama = formStateToRequest(
      "ollama.generate.v1",
      { model: "llama", prompt: "" },
      {
        model: "llama",
        temperature: 0.2,
        stream: true,
        developerMessage: "System prompt",
        messages: [{ id: "message_0", role: "user", content: "Generate" }],
      },
    );
    expect(ollama.prompt).toBe("Generate");
    expect(ollama["system"]).toBe("System prompt");
  });

  it("handles malformed or sparse requests with MVP defaults", () => {
    expect(requestToFormState("openai.chat.completions.v1", {})).toEqual({
      model: "local-model",
      temperature: 0.7,
      stream: false,
      developerMessage: "",
      messages: [],
    });

    expect(
      requestToFormState("openai.responses.v1", {
        model: "local",
        input: [{ content: [{ text: "piece " }, { type: "image" }, { text: "text" }] }],
      }).messages,
    ).toEqual([{ id: "message_0", role: "user", content: "piece text" }]);

    expect(
      formStateToRequest(
        "ollama.chat.v1",
        { model: "llama" },
        {
          model: "llama",
          temperature: 0.4,
          stream: true,
          developerMessage: "System prompt",
          messages: [{ id: "message_0", role: "user", content: "Hi" }],
        },
      ).messages,
    ).toEqual([
      { role: "system", content: "System prompt" },
      { role: "user", content: "Hi" },
    ]);
  });
});
