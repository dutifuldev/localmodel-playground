import { isJsonObject, parseJson, type JsonObject } from "../../shared/json";
import type { ApiShapeId, SourceRef } from "../../shared/types";
import { detectRequestShape, unwrapRequestEnvelope } from "../requests/detection";

export type ImportedRequest = {
  readonly title: string;
  readonly request: JsonObject;
  readonly apiShape: ApiShapeId;
  readonly source: SourceRef;
  readonly diagnostics: readonly string[];
};

export const importRequestFile = async (
  file: File,
  relativePath?: string,
): Promise<ImportedRequest> => {
  const text = await file.text();
  const parsed = parseJson(text);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  const unwrapped = unwrapRequestEnvelope(parsed.value);
  if (!isJsonObject(unwrapped)) {
    throw new Error("Imported JSON must be an object request.");
  }

  const detection = detectRequestShape(parsed.value);
  const source: SourceRef = relativePath
    ? {
        kind: "directory",
        fileName: file.name,
        relativePath,
        canSaveBack: false,
      }
    : {
        kind: "file",
        fileName: file.name,
        canSaveBack: false,
      };

  return {
    title: file.name.replace(/\.(request|prompt)?\.?json$/u, "") || "Imported request",
    request: unwrapped,
    apiShape: detection.selected.apiShape,
    source,
    diagnostics: detection.selected.reasons,
  };
};

export const importManyFiles = async (
  files: readonly File[],
): Promise<readonly ImportedRequest[]> => {
  const supported = files.filter((file) => file.name.endsWith(".json"));
  return Promise.all(
    supported.map((file) => {
      const fileWithPath = file as File & { readonly webkitRelativePath?: string };
      return importRequestFile(file, fileWithPath.webkitRelativePath);
    }),
  );
};
