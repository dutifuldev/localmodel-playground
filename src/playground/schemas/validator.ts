import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import endpointPresetSchema from "../../../docs/schemas/endpoint-preset.v1.schema.json";
import playgroundStateSchema from "../../../docs/schemas/playground-state.v1.schema.json";
import playgroundTabSchema from "../../../docs/schemas/playground-tab.v1.schema.json";
import promptWorkspaceSchema from "../../../docs/schemas/prompt-workspace.v1.schema.json";
import requestEnvelopeSchema from "../../../docs/schemas/request-envelope.v1.schema.json";
import runRecordSchema from "../../../docs/schemas/run-record.v1.schema.json";
import type { JsonValue } from "../../shared/json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const schemas = [
  endpointPresetSchema,
  playgroundStateSchema,
  playgroundTabSchema,
  promptWorkspaceSchema,
  requestEnvelopeSchema,
  runRecordSchema,
];

for (const schema of schemas) {
  ajv.addSchema(schema);
}

export const validateWithSchema = (
  schemaId: string,
  value: JsonValue,
):
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly ErrorObject[] } => {
  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    throw new Error(`Unknown schema: ${schemaId}`);
  }

  const valid = validate(value);
  return valid ? { valid: true } : { valid: false, errors: validate.errors ?? [] };
};

export const formatSchemaErrors = (errors: readonly ErrorObject[]): readonly string[] =>
  errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
