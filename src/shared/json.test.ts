import { describe, expect, it } from "vitest";

import {
  getBoolean,
  getString,
  isJsonObject,
  jsonHash,
  parseJson,
  stableStringify,
} from "./json";

describe("json helpers", () => {
  it("parses valid JSON and reports invalid JSON without throwing", () => {
    expect(parseJson('{"model":"local","stream":true}')).toEqual({
      ok: true,
      value: { model: "local", stream: true },
    });

    const invalid = parseJson("{");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.message).toContain("JSON");
    }
  });

  it("detects objects and reads typed properties", () => {
    const value = { model: "mistral", stream: true };

    expect(isJsonObject(value)).toBe(true);
    expect(getString(value, "model")).toBe("mistral");
    expect(getBoolean(value, "stream")).toBe(true);
    expect(isJsonObject(["not", "object"])).toBe(false);
    expect(getString(value, "stream")).toBeUndefined();
    expect(getBoolean(value, "model")).toBeUndefined();
  });

  it("creates stable string output and hashes independent of key order", async () => {
    const first = { b: 2, a: { d: 4, c: 3 } };
    const second = { a: { c: 3, d: 4 }, b: 2 };

    expect(stableStringify(first)).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 2\n}',
    );
    await expect(jsonHash(first)).resolves.toBe(await jsonHash(second));
  });
});
