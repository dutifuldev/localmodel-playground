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

  it("preserves the original OpenAI chat instruction role during structured edits", () => {
    const request = {
      model: "local-chat",
      messages: [
        { role: "system", content: "Use legacy-compatible system role." },
        { role: "user", content: "Ping" },
      ],
    };

    const form = requestToFormState("openai.chat.completions.v1", request);
    const edited = formStateToRequest("openai.chat.completions.v1", request, {
      ...form,
      temperature: 0.2,
    });

    expect(edited.messages).toEqual([
      { role: "system", content: "Use legacy-compatible system role." },
      { role: "user", content: "Ping" },
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
    expect(responses["instructions"]).toBe("Use JSON.");
    expect(responses.input).toEqual([{ role: "user", content: "Make a plan" }]);

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

  it("surfaces native instruction fields and clears them through structured edits", () => {
    const responsesForm = requestToFormState("openai.responses.v1", {
      model: "local",
      instructions: "Native instructions",
      input: "Ask this",
    });
    expect(responsesForm.developerMessage).toBe("Native instructions");
    expect(responsesForm.messages).toEqual([
      { id: "message_1", role: "user", content: "Ask this" },
    ]);
    const responses = formStateToRequest(
      "openai.responses.v1",
      {},
      {
        ...responsesForm,
        developerMessage: "",
      },
    );
    expect(responses["instructions"]).toBeUndefined();
    expect(responses.input).toEqual([{ role: "user", content: "Ask this" }]);

    const ollamaForm = requestToFormState("ollama.generate.v1", {
      model: "llama",
      system: "Native system",
      prompt: "Generate this",
    });
    expect(ollamaForm.developerMessage).toBe("Native system");
    expect(ollamaForm.messages).toEqual([
      { id: "message_1", role: "user", content: "Generate this" },
    ]);
    const ollama = formStateToRequest(
      "ollama.generate.v1",
      { system: "stale" },
      {
        ...ollamaForm,
        developerMessage: "",
      },
    );
    expect(ollama["system"]).toBeUndefined();
    expect(ollama.prompt).toBe("Generate this");
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

  it("surfaces imported completions prompt arrays before structured edits", () => {
    const request = {
      model: "local",
      prompt: ["First prompt", "Second prompt"],
    };
    const form = requestToFormState("openai.completions.v1", request);

    expect(form.messages).toEqual([
      { id: "message_0", role: "user", content: "First prompt" },
      { id: "message_1", role: "user", content: "Second prompt" },
    ]);
    expect(
      formStateToRequest("openai.completions.v1", request, {
        ...form,
        model: "changed",
      }).prompt,
    ).toContain("First prompt");
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
