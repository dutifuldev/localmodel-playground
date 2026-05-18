import type { JsonObject, JsonValue } from "./json";

export type ApiShapeId =
  | "openai.chat.completions.v1"
  | "openai.completions.v1"
  | "openai.responses.v1"
  | "ollama.chat.v1"
  | "ollama.generate.v1";

export type ProviderId = "lmstudio" | "ollama" | "vllm" | "openai-compatible" | "custom";

export type AuthConfig =
  | { readonly type: "none" }
  | {
      readonly type: "bearer";
      readonly token?: string;
      readonly exportable: false;
    }
  | {
      readonly type: "header";
      readonly headerName: string;
      readonly headerValue?: string;
      readonly exportable: false;
    };

export type ModelDiscoveryConfig =
  | { readonly type: "openai-models"; readonly path: "/models" }
  | { readonly type: "ollama-tags"; readonly path: "/api/tags" }
  | { readonly type: "manual" };

export type EndpointPreset = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderId;
  readonly baseUrl: string;
  readonly auth: AuthConfig;
  readonly modelDiscovery: ModelDiscoveryConfig;
  readonly supportedShapes: readonly ApiShapeId[];
};

export type ViewState = {
  readonly activePanel: "conversation" | "raw-response" | "request-json" | "schema";
  readonly sidebarCollapsed: boolean;
  readonly resultPanelWidth: number;
};

export type SourceRef = {
  readonly kind: "none" | "file" | "directory" | "bundle" | "example" | "download";
  readonly fileName?: string;
  readonly relativePath?: string;
  readonly directoryId?: string;
  readonly canSaveBack: boolean;
};

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

export type RunError = {
  readonly kind: "cors" | "network" | "http" | "validation" | "unsupported" | "unknown";
  readonly message: string;
  readonly redacted: boolean;
};

export type RunMetrics = {
  readonly latencyMs?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
};

export type ParsedRunResponse = {
  readonly text: string;
  readonly finishReason?: string;
  readonly usage?: RunMetrics;
};

export type RunRecord = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly endpointPresetId: string;
  readonly apiShape: ApiShapeId;
  readonly model?: string;
  readonly requestHash: string;
  readonly status: RunStatus;
  readonly response?: JsonValue;
  readonly parsed?: ParsedRunResponse;
  readonly error?: RunError;
  readonly metrics?: RunMetrics;
};

export type PlaygroundTab = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly dirty: boolean;
  readonly source: SourceRef;
  readonly endpointPresetId: string;
  readonly model: string;
  readonly apiShape: ApiShapeId;
  readonly request: JsonObject;
  readonly editorMode: "form" | "json" | "split";
  readonly viewState: ViewState;
  readonly currentRun?: RunRecord;
  readonly lastRun?: RunRecord;
  readonly runHistory: readonly RunRecord[];
};

export type PlaygroundState = {
  readonly schemaVersion: 1;
  readonly activeTabId: string;
  readonly tabs: readonly PlaygroundTab[];
  readonly endpointPresets: readonly EndpointPreset[];
  readonly recentSources: readonly SourceRef[];
};

export type DetectionResult = {
  readonly apiShape: ApiShapeId;
  readonly confidence: number;
  readonly reasons: readonly string[];
};

export type HttpRequest = {
  readonly url: string;
  readonly init: RequestInit;
  readonly streamKind: "none" | "sse" | "ndjson";
};

export type ApiShapeAdapter = {
  readonly id: ApiShapeId;
  readonly label: string;
  readonly defaultRequest: (model: string) => JsonObject;
  readonly detect: (value: JsonValue) => DetectionResult;
  readonly buildHttpRequest: (args: {
    readonly endpoint: EndpointPreset;
    readonly request: JsonObject;
  }) => HttpRequest;
  readonly parseResponse: (response: JsonValue) => ParsedRunResponse;
};
