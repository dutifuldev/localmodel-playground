import { describe, expect, it } from "vitest";

import { importManyFiles, importRequestFile } from "./fileImport";

describe("file import", () => {
  it("loads a single request file and detects its API shape", async () => {
    const file = textFile(
      JSON.stringify({
        apiShape: "openai.responses.v1",
        request: {
          model: "local",
          input: [{ role: "user", content: "ping" }],
        },
      }),
      "responses.request.json",
    );

    await expect(importRequestFile(file)).resolves.toMatchObject({
      title: "responses",
      apiShape: "openai.responses.v1",
      request: {
        model: "local",
        input: [{ role: "user", content: "ping" }],
      },
      source: { kind: "file", fileName: "responses.request.json", canSaveBack: false },
    });
  });

  it("filters non-json files during multi-file imports", async () => {
    const json = textFile('{"model":"local","prompt":"hello"}', "prompt.json");
    const text = textFile("not json", "notes.txt", "text/plain");

    const imported = await importManyFiles([json, text]);

    expect(imported).toHaveLength(1);
    expect(imported[0]?.title).toBe("prompt");
  });

  it("rejects non-object JSON imports", async () => {
    const file = textFile("[]", "bad.json");

    await expect(importRequestFile(file)).rejects.toThrow(
      "Imported JSON must be an object request.",
    );
  });
});

const textFile = (source: string, name: string, type = "application/json"): File => {
  const file = new File([source], name, { type });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(source),
  });
  return file;
};
