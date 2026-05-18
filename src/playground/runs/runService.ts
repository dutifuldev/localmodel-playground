import { jsonHash, parseJson, type JsonObject, type JsonValue } from "../../shared/json";
import type { EndpointPreset, RunError, RunRecord } from "../../shared/types";
import { explainEndpointError } from "../endpoints/corsDiagnostics";
import { endpointSupportsShape } from "../endpoints/providers";
import { adapterById } from "../requests/registry";
import { parseNdjsonText, parseSseText } from "./streamParsers";

export type RunRequestArgs = {
  readonly endpoint: EndpointPreset;
  readonly apiShape: RunRecord["apiShape"];
  readonly request: JsonObject;
  readonly signal?: AbortSignal;
};

export const runRequest = async (args: RunRequestArgs): Promise<RunRecord> => {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const requestHash = await jsonHash(args.request);

  if (!endpointSupportsShape(args.endpoint, args.apiShape)) {
    return failedRun(
      args,
      requestHash,
      startedAt,
      "unsupported",
      "Selected endpoint cannot execute this API shape.",
    );
  }

  const httpRequest = adapterById(args.apiShape).buildHttpRequest({
    endpoint: args.endpoint,
    request: args.request,
  });

  try {
    const response = await fetch(httpRequest.url, requestInit(httpRequest.init, args.signal));

    if (!response.ok) {
      const finishedAt = new Date().toISOString();
      const latencyMs = Math.round(performance.now() - started);
      return httpFailedRun(args, requestHash, startedAt, finishedAt, latencyMs, response);
    }

    return await successfulRun(
      args,
      requestHash,
      startedAt,
      started,
      httpRequest.streamKind,
      response,
    );
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? cancelledRun(args, requestHash, startedAt)
      : failedRun(
          args,
          requestHash,
          startedAt,
          "cors",
          explainEndpointError(error, httpRequest.url),
        );
  }
};

const requestInit = (init: RequestInit, signal: AbortSignal | undefined): RequestInit =>
  signal ? { ...init, signal } : init;

const httpFailedRun = (
  args: RunRequestArgs,
  requestHash: string,
  startedAt: string,
  finishedAt: string,
  latencyMs: number,
  response: Response,
): RunRecord => ({
  ...baseRun(args, requestHash, startedAt),
  finishedAt,
  status: "failed",
  error: {
    kind: "http",
    message: httpErrorMessage(response),
    redacted: true,
  },
  metrics: { latencyMs },
});

const httpErrorMessage = (response: Response): string => {
  const statusText = response.statusText.trim();
  return statusText
    ? `HTTP ${String(response.status)} ${statusText}`
    : `HTTP ${String(response.status)}`;
};

const successfulRun = async (
  args: RunRequestArgs,
  requestHash: string,
  startedAt: string,
  started: number,
  streamKind: "none" | "sse" | "ndjson",
  response: Response,
): Promise<RunRecord> => {
  const adapter = adapterById(args.apiShape);
  const body = await readBody(response, streamKind);
  const parsed = parseBody(streamKind, body.text);
  const finishedAt = new Date().toISOString();
  const latencyMs = Math.round(performance.now() - started);
  const responseValue = parsed.response;
  const parsedResponse =
    parsed.textOnly !== undefined
      ? { text: parsed.textOnly }
      : adapter.parseResponse(responseValue ?? {});
  const metrics = parsedResponse.usage ? { latencyMs, ...parsedResponse.usage } : { latencyMs };
  const base = {
    ...baseRun(args, requestHash, startedAt),
    finishedAt,
    status: body.status,
    parsed: parsedResponse,
    metrics,
    ...(body.status === "cancelled"
      ? { error: { kind: "unknown", message: "Run cancelled.", redacted: true } }
      : {}),
  } satisfies RunRecord;

  return responseValue === undefined ? base : { ...base, response: responseValue };
};

type BodyReadResult = {
  readonly status: "succeeded" | "cancelled";
  readonly text: string;
};

const readBody = async (
  response: Response,
  streamKind: "none" | "sse" | "ndjson",
): Promise<BodyReadResult> => {
  if (streamKind === "none" || !response.body) {
    return { status: "succeeded", text: await response.text() };
  }

  return readStreamingBody(response.body);
};

const readStreamingBody = async (body: ReadableStream<Uint8Array>): Promise<BodyReadResult> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        text += decoder.decode();
        return { status: "succeeded", text };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    if (isAbortError(error)) {
      text += decoder.decode();
      return { status: "cancelled", text };
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const parseBody = (
  streamKind: "none" | "sse" | "ndjson",
  body: string,
): { readonly response?: JsonValue; readonly textOnly?: string } => {
  if (streamKind === "sse") {
    const stream = parseSseText(body);
    if (!stream.text && stream.events.length === 0) {
      return parseNonStreamingBody(body);
    }
    return { response: { events: [...stream.events] }, textOnly: stream.text };
  }

  if (streamKind === "ndjson") {
    const stream = parseNdjsonText(body);
    if (!stream.text && stream.events.length === 0) {
      return parseNonStreamingBody(body);
    }
    return { response: { events: [...stream.events] }, textOnly: stream.text };
  }

  return parseNonStreamingBody(body);
};

const parseNonStreamingBody = (
  body: string,
): { readonly response?: JsonValue; readonly textOnly?: string } => {
  const parsed = parseJson(body);
  return parsed.ok ? { response: parsed.value } : { textOnly: body };
};

const baseRun = (
  args: RunRequestArgs,
  requestHash: string,
  startedAt: string,
): Omit<RunRecord, "status"> => {
  const model = typeof args.request.model === "string" ? args.request.model : undefined;
  const run = {
    schemaVersion: 1,
    id: `run_${String(Date.now())}`,
    startedAt,
    endpointPresetId: args.endpoint.id,
    apiShape: args.apiShape,
    requestHash,
  } satisfies Omit<RunRecord, "status">;
  return model ? { ...run, model } : run;
};

const failedRun = (
  args: RunRequestArgs,
  requestHash: string,
  startedAt: string,
  kind: RunError["kind"],
  message: string,
): RunRecord => ({
  ...baseRun(args, requestHash, startedAt),
  finishedAt: new Date().toISOString(),
  status: "failed",
  error: { kind, message, redacted: true },
});

const cancelledRun = (
  args: RunRequestArgs,
  requestHash: string,
  startedAt: string,
): RunRecord => ({
  ...baseRun(args, requestHash, startedAt),
  finishedAt: new Date().toISOString(),
  status: "cancelled",
  error: { kind: "unknown", message: "Run cancelled.", redacted: true },
});
