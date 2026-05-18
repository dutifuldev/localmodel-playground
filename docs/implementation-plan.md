# LocalModel Playground Implementation Plan

Date: 2026-05-18

## Goal

Build a local-model playground that feels like a simplified OpenAI Playground for request construction and response inspection, while adding first-class support for local endpoints, version-controlled prompt/request files, and browser-like prompt tabs.

The app should let a user:

- Create and switch between multiple prompt tabs.
- Configure provider endpoint presets for LM Studio, Ollama, vLLM, and OpenAI-compatible local servers.
- Discover available models from the selected endpoint where possible.
- Create a prompt/request in an OpenAI Playground-like UI.
- Load a JSON request file and automatically detect its API shape.
- Edit the request through structured UI controls and raw JSON when needed.
- Run the request against the selected local model endpoint.
- Save prompts, requests, responses, and revisions in normal version-controlled files.

## Product Shape

The first screen should be the actual playground, not a landing page.

Recommended layout:

- Left sidebar: endpoint presets, model selector, request files, saved prompts.
- Main editor column: tab strip, prompt/request editor, model/request configuration, message blocks, tools/variables sections.
- Right result column: conversation/output, raw response, request/response metadata, errors.
- Bottom or side drawer: raw JSON, schema diagnostics, import/export controls.

The prompt creation surface should echo the OpenAI Playground structure:

- Header with prompt name, dirty state, save action, duplicate/compare actions.
- Model section with selected provider, endpoint, model, and API shape.
- Request settings section for temperature, max tokens, stream, reasoning, text format, store, tool choice, and other shape-specific fields.
- Developer/system instruction block.
- Prompt message list with role selectors and expandable message editors.
- Variables section for template variables.
- Tools section for OpenAI-compatible function tools or provider-specific tools.
- Composer/run area with a clear Run button and streaming status.

## Prompt Tabs

Tabs should behave like browser tabs:

- Each tab represents one prompt/request workspace.
- A tab has title, dirty state, request file path, selected endpoint preset, selected model, API shape, editor state, and last run result.
- Users can create, close, duplicate, reorder, and switch tabs.
- Closing a dirty tab requires save/discard confirmation.
- Tabs should survive reload through local app state.

Initial tab model:

```ts
type PlaygroundTab = {
  id: string;
  title: string;
  dirty: boolean;
  filePath?: string;
  endpointPresetId?: string;
  apiShape: ApiShapeId;
  request: JsonObject;
  editorMode: "form" | "json" | "split";
  lastRun?: RunRecord;
};
```

## Endpoint Support

Support endpoint presets rather than hard-coding one server.

Initial providers:

- LM Studio OpenAI-compatible chat completions:
  - Default base URL: `http://127.0.0.1:1234/v1`
  - Models: `GET /models`
  - Run: `POST /chat/completions`
- Ollama native:
  - Default base URL: `http://127.0.0.1:11434`
  - Models: `GET /api/tags`
  - Run: `POST /api/chat` and later `POST /api/generate`
- vLLM OpenAI-compatible:
  - Default base URL: user supplied, often `http://127.0.0.1:8000/v1`
  - Models: `GET /models`
  - Run: `POST /chat/completions`, optionally `/completions`
- Generic OpenAI-compatible:
  - User-supplied base URL.
  - Optional bearer token.
  - Supports `models`, `chat.completions`, `completions`, and `responses` when the endpoint implements them.

Endpoint preset fields:

```ts
type EndpointPreset = {
  id: string;
  name: string;
  provider: "lmstudio" | "ollama" | "vllm" | "openai-compatible" | "custom";
  baseUrl: string;
  auth?: {
    type: "none" | "bearer" | "header";
    envVar?: string;
    headerName?: string;
  };
  modelDiscovery: ModelDiscoveryConfig;
  supportedShapes: ApiShapeId[];
};
```

Secrets should not be stored in prompt files. If auth is needed, store only an env var name or local secret reference.

## API Shapes

Represent each request format as a versioned schema adapter. This is the key abstraction.

Initial shapes:

- `openai.chat.completions.v1`
- `openai.completions.v1`
- `openai.responses.v1`
- `ollama.chat.v1`
- `ollama.generate.v1`

Each shape adapter owns:

- JSON Schema for validation.
- Detection rules for imported JSON.
- Default request template.
- Form mapping from request JSON to UI controls.
- Serialization from UI state back to request JSON.
- Endpoint compatibility rules.
- Response parser and display mapping.

Adapter interface:

```ts
type ApiShapeAdapter = {
  id: ApiShapeId;
  label: string;
  jsonSchema: JsonSchema;
  defaultRequest(provider?: EndpointPreset): JsonObject;
  detect(input: unknown): DetectionResult;
  toFormState(request: JsonObject): RequestFormState;
  fromFormState(form: RequestFormState): JsonObject;
  buildHttpRequest(args: RunArgs): HttpRequest;
  parseResponse(response: unknown): ParsedRunResponse;
};
```

## JSON Import And Auto-Detection

When a user loads a JSON file:

1. Parse JSON and preserve original formatting separately if practical.
2. Run every adapter's `detect()` method.
3. Choose the highest-confidence match.
4. If confidence is ambiguous, show a shape picker with evidence.
5. Validate against the selected shape schema.
6. Open the request in a new tab, keeping the file path attached.

Detection examples:

- Chat Completions:
  - Has `messages` array with role/content entries.
  - Often has `model`, `temperature`, `max_tokens`, `tools`, `tool_choice`, `stream`.
  - Target path commonly `/v1/chat/completions`.
- Completions:
  - Has `prompt` string/array.
  - Often has `max_tokens`, `temperature`, `suffix`, `echo`.
- Responses:
  - Has `input` string/array or `instructions`.
  - May have `text.format`, `reasoning`, `tools`, `store`.
- Ollama chat:
  - Has `model` and `messages`, often `options`, `keep_alive`, `format`.
  - Native endpoint path `/api/chat`.
- Ollama generate:
  - Has `model` and `prompt`, often `system`, `template`, `context`, `options`.

The imported JSON file should remain the source of truth until the user saves a transformed copy.

## Version-Controlled File Model

Use plain files so Git captures every prompt and request change.

Suggested repo/user workspace structure:

```text
playground/
  endpoints/
    lmstudio.local.json
    ollama.local.json
  prompts/
    my-prompt.prompt.json
  requests/
    chat-completions/
      sample.request.json
    responses/
      sample.request.json
  runs/
    2026-05-18T064500Z-my-prompt.run.json
```

File conventions:

- `*.request.json`: raw provider/API request body plus optional metadata envelope.
- `*.prompt.json`: editor-native prompt workspace with tabs/messages/settings.
- `*.run.json`: saved run result with request hash, endpoint preset id, model, response, timing, and error metadata.
- Never commit secrets, bearer tokens, cookies, or local auth headers.

Use a metadata envelope only when needed:

```json
{
  "$schema": "https://dutiful.dev/localmodel-playground/schemas/request-envelope.v1.json",
  "apiShape": "openai.chat.completions.v1",
  "endpointPreset": "lmstudio-local",
  "request": {
    "model": "local-model",
    "messages": []
  }
}
```

The loader should also accept raw API request JSON without the envelope.

## Storage Strategy

Use two layers:

- Project files for version-controlled artifacts.
- Browser/local app state for volatile UI state.

Version-controlled:

- Endpoint presets without secrets.
- Prompt workspaces.
- Request JSON files.
- Saved run records when the user opts in.
- JSON schemas and migrations.

Local-only:

- Open tabs and layout state.
- Recently used endpoints.
- Unsaved draft snapshots.
- Secret references and auth values.

## Suggested Technical Stack

Recommended first implementation:

- Vite + React + TypeScript for the UI.
- Monaco Editor for raw JSON editing and schema validation.
- Zustand or equivalent small state store for tabs/session state.
- Zod or JSON Schema validation through Ajv for request schemas.
- Node/Electron or Tauri only if direct filesystem access is required in the first release.

Important tradeoff:

- Browser-only app is simpler but has CORS and filesystem limitations.
- Desktop shell or local helper server makes local endpoints, file watching, and Git workflows much cleaner.

Recommended architecture:

- Web UI talks to a local app backend.
- Backend handles filesystem reads/writes, model endpoint proxying, streaming, and optional Git status.
- UI stays provider-agnostic and uses API shape adapters.

## Streaming And Runs

The run service should support:

- Non-streaming JSON responses.
- Server-sent event streaming for OpenAI-compatible endpoints.
- Ollama newline-delimited JSON streaming.
- Cancellation through AbortController.
- Request/response logging with redaction.

Run record:

```ts
type RunRecord = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  endpointPresetId: string;
  apiShape: ApiShapeId;
  model?: string;
  requestHash: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  response?: unknown;
  parsed?: ParsedRunResponse;
  error?: RunError;
  metrics?: {
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};
```

## End-To-End Build Scope

Build the complete playground in one implementation pass. Do not split the work into reduced partial deliveries that defer core behavior. The initial delivery should include the full path from prompt/request creation through local endpoint execution and file-based version control.

The implementation pass should deliver:

- App shell with sidebar, tab strip, editor column, and result column.
- Browser-like prompt tabs with create, switch, close, duplicate, dirty state, and reload persistence.
- Endpoint presets for LM Studio, Ollama, vLLM, and generic OpenAI-compatible servers.
- Model discovery for LM Studio, vLLM, and Ollama, with manual model entry as fallback.
- Request shape adapters for Chat Completions, Responses, Completions, Ollama chat, and Ollama generate.
- Structured request editor plus raw JSON and split edit modes.
- JSON file import with automatic shape detection, validation, and ambiguous-shape picker.
- Backend proxy/run service for local endpoint calls, filesystem access, streaming, cancellation, and redacted logging.
- Execution against LM Studio/vLLM chat completions and Ollama native chat, with response, raw JSON, timing, and error display.
- Workspace file tree for prompts, requests, endpoint presets, and run records.
- Save, save-as, duplicate, rename, delete, and load flows for version-controlled files.
- Optional Git status badges for changed and untracked workspace files.
- Redaction checks before saving request and run artifacts.
- Variables panel with test values.
- Tool/function editor for OpenAI-compatible tools.
- Compare mode between two tabs or two saved runs.
- Request/run history per prompt.
- Export/import bundle support.

The build can still be sequenced internally for engineering sanity, but the plan is for one complete delivery rather than partial releases.

## Initial File/Module Plan

```text
src/
  app/
    App.tsx
    routes.tsx
  playground/
    PlaygroundShell.tsx
    tabs/
      tabStore.ts
      TabStrip.tsx
    endpoints/
      endpointStore.ts
      EndpointPanel.tsx
      providers.ts
    requests/
      adapters/
        openaiChatCompletions.ts
        openaiResponses.ts
        openaiCompletions.ts
        ollamaChat.ts
        ollamaGenerate.ts
      detection.ts
      schemas/
      RequestEditor.tsx
      RawJsonEditor.tsx
    runs/
      runService.ts
      ResponsePanel.tsx
      streamParsers.ts
  shared/
    json.ts
    redaction.ts
    types.ts
server/
  index.ts
  filesystem.ts
  endpointProxy.ts
  modelDiscovery.ts
  gitStatus.ts
```

## Open Questions

- Should the app be packaged as a browser app with local helper backend, Electron, or Tauri?
- Should prompt/request files live inside this repo by default, or should the app open arbitrary workspaces?
- Should saved run responses be committed by default, or opt-in only?
- Should the Responses API shape be treated as OpenAI-compatible only, or should local adapters be allowed to approximate it for servers that do not implement `/v1/responses`?
- How much of the OpenAI Playground's prompt optimization/evaluation surface should be included in the one-pass build?

## Recommended Delivery

Use a React TypeScript UI with a local helper backend from the start. The backend should own filesystem access, endpoint proxying, streaming, model discovery, and Git status so the playground can support local servers and version-controlled files without CORS or browser filesystem compromises.

Ship the full adapter set in the initial delivery: `openai.chat.completions.v1`, `openai.completions.v1`, `openai.responses.v1`, `ollama.chat.v1`, and `ollama.generate.v1`. Local endpoints that cannot execute a detected shape should still be able to load, validate, edit, and save that request, while the UI clearly marks execution as unsupported for the selected endpoint.
