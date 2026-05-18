import { describe, expect, it } from "vitest";

import { parseJson } from "../../shared/json";
import { createDefaultState } from "../state/defaults";
import { formatSchemaErrors, validateWithSchema } from "./validator";

describe("schema validator", () => {
  it("validates the documented playground state schema", () => {
    const state = parseJson(JSON.stringify(createDefaultState()));
    expect(state.ok).toBe(true);
    if (!state.ok) {
      return;
    }

    expect(
      validateWithSchema(
        "https://dutiful.dev/localmodel-playground/schemas/playground-state.v1.schema.json",
        state.value,
      ),
    ).toEqual({ valid: true });
  });

  it("formats validation errors and rejects unknown schema ids", () => {
    const result = validateWithSchema(
      "https://dutiful.dev/localmodel-playground/schemas/run-record.v1.schema.json",
      { schemaVersion: 1 },
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(formatSchemaErrors(result.errors).join("\n")).toContain(
        "must have required property",
      );
    }

    expect(() => validateWithSchema("missing", {})).toThrow("Unknown schema");
  });
});
