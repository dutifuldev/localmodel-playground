import Editor from "@monaco-editor/react";
import {
  AlertCircle,
  Braces,
  ChevronDown,
  Copy,
  FileDown,
  FileJson,
  FolderOpen,
  PanelLeftClose,
  Play,
  Plus,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { examples } from "../examples/examples";
import { isJsonObject, parseJson, stableStringify, type JsonObject } from "../shared/json";
import type { EndpointPreset, PlaygroundTab, RunRecord } from "../shared/types";
import { discoverModels } from "./endpoints/modelDiscovery";
import { endpointSupportsShape } from "./endpoints/providers";
import { canPickDirectory, pickDirectoryRequests } from "./files/directoryImport";
import { downloadJson, runRecordFileName, tabToPromptWorkspace } from "./files/fileExport";
import { importManyFiles, importRequestFile, type ImportedRequest } from "./files/fileImport";
import {
  formStateToRequest,
  requestToFormState,
  type MessageRow,
} from "./requests/formMapping";
import { adapterById, adapters } from "./requests/registry";
import { runRequest } from "./runs/runService";
import { playgroundReducer } from "./state/reducer";
import { loadPlaygroundState, savePlaygroundState } from "./state/storage";

export const App = (): React.JSX.Element => {
  const [state, dispatch] = useReducer(playgroundReducer, undefined, loadPlaygroundState);
  const [rawJson, setRawJson] = useState("");
  const [jsonError, setJsonError] = useState<string | undefined>();
  const [models, setModels] = useState<readonly string[]>([]);
  const [modelStatus, setModelStatus] = useState("Manual model entry available");
  const abortControllersRef = useRef(new Map<string, AbortController>());

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0];
  const activeEndpoint = state.endpointPresets.find(
    (endpoint) => endpoint.id === activeTab?.endpointPresetId,
  );
  const activeTabId = activeTab?.id;
  const activeRequest = activeTab?.request;

  useEffect(() => {
    savePlaygroundState(state);
  }, [state]);

  useEffect(() => {
    if (activeRequest) {
      setRawJson(stableStringify(activeRequest));
      setJsonError(undefined);
    }
  }, [activeTabId, activeRequest]);

  const formState = useMemo(
    () => (activeTab ? requestToFormState(activeTab.apiShape, activeTab.request) : undefined),
    [activeTab],
  );
  const requestIsValid = jsonError === undefined;

  if (!activeTab || !activeEndpoint || !formState) {
    return <div className="boot-error">No active playground tab.</div>;
  }

  const updateActiveTab = (patch: Partial<PlaygroundTab>): void => {
    dispatch({ type: "update-tab", tabId: activeTab.id, patch: { ...patch, dirty: true } });
  };

  const updateRequest = (request: JsonObject): void => {
    updateActiveTab({
      request,
      model: typeof request.model === "string" ? request.model : activeTab.model,
    });
  };

  const updateForm = (next: typeof formState): void => {
    updateRequest(formStateToRequest(activeTab.apiShape, activeTab.request, next));
  };

  const loadModels = async (): Promise<void> => {
    setModelStatus("Discovering models...");
    const result = await discoverModels(activeEndpoint);
    if (result.ok) {
      setModels(result.models);
      setModelStatus(
        result.models.length
          ? `${String(result.models.length)} models found`
          : "No models returned",
      );
    } else {
      setModelStatus(result.message);
    }
  };

  const runActiveTab = async (): Promise<void> => {
    if (!requestIsValid) {
      return;
    }

    if (!endpointSupportsShape(activeEndpoint, activeTab.apiShape)) {
      const run: RunRecord = {
        schemaVersion: 1,
        id: `run_${String(Date.now())}`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        endpointPresetId: activeEndpoint.id,
        apiShape: activeTab.apiShape,
        model: activeTab.model,
        requestHash: "unsupported",
        status: "failed",
        error: {
          kind: "unsupported",
          message: "Selected endpoint cannot execute this API shape.",
          redacted: true,
        },
      };
      dispatch({ type: "record-run", tabId: activeTab.id, run });
      return;
    }

    const tabId = activeTab.id;
    const controller = new AbortController();
    abortControllersRef.current.set(tabId, controller);
    const pending: RunRecord = {
      schemaVersion: 1,
      id: `run_${String(Date.now())}`,
      startedAt: new Date().toISOString(),
      endpointPresetId: activeEndpoint.id,
      apiShape: activeTab.apiShape,
      model: activeTab.model,
      requestHash: "pending",
      status: "running",
    };
    dispatch({ type: "update-tab", tabId, patch: { currentRun: pending } });
    try {
      const run = await runRequest({
        endpoint: activeEndpoint,
        apiShape: activeTab.apiShape,
        request: activeTab.request,
        signal: controller.signal,
      });
      dispatch({ type: "record-run", tabId, run });
    } finally {
      if (abortControllersRef.current.get(tabId) === controller) {
        abortControllersRef.current.delete(tabId);
      }
    }
  };

  const stopRun = (): void => {
    abortControllersRef.current.get(activeTab.id)?.abort();
  };

  const applyRawJson = (value: string | undefined): void => {
    const nextValue = value ?? "";
    setRawJson(nextValue);
    const parsed = parseJson(nextValue);
    if (!parsed.ok) {
      setJsonError(parsed.message);
      return;
    }
    if (!isJsonObject(parsed.value)) {
      setJsonError("Request JSON must be an object.");
      return;
    }
    setJsonError(undefined);
    updateRequest(parsed.value);
  };

  const importFiles = async (files: FileList | null): Promise<void> => {
    if (!files) {
      return;
    }
    const imported = await importManyFiles(Array.from(files));
    for (const item of imported) {
      openImportedRequest(item);
    }
  };

  const importSingle = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return;
    }
    const imported = await importRequestFile(file);
    openImportedRequest(imported);
  };

  const importDirectory = async (): Promise<void> => {
    const imported = await pickDirectoryRequests();
    for (const item of imported) {
      openImportedRequest(item);
    }
  };

  const openImportedRequest = (item: ImportedRequest): void => {
    if (item.tabs?.length) {
      for (const tab of item.tabs) {
        dispatch({ type: "open-tab", tab });
      }
      return;
    }
    dispatch({ type: "open-request", ...item });
  };

  const closeTab = (tabId: string): void => {
    const tab = state.tabs.find((item) => item.id === tabId);
    const force =
      !tab?.dirty ||
      window.confirm(`Discard unsaved changes in "${tab.title}" and close this tab?`);
    if (force) {
      dispatch({ type: "close-tab", tabId, force });
    }
  };

  return (
    <div className="app-shell">
      <TopBar />
      <main className="workspace">
        <Sidebar
          activeEndpoint={activeEndpoint}
          endpoints={state.endpointPresets}
          models={models}
          modelStatus={modelStatus}
          activeTab={activeTab}
          onEndpointChange={(endpointId) => updateActiveTab({ endpointPresetId: endpointId })}
          onModelChange={(model) => updateForm({ ...formState, model })}
          onDiscoverModels={() => void loadModels()}
          onImportFile={(file) => void importSingle(file)}
          onImportFiles={(files) => void importFiles(files)}
          onImportDirectory={() => void importDirectory()}
          directoryAvailable={canPickDirectory()}
          onLoadExample={(index) => {
            const example = examples[index];
            if (!example) {
              return;
            }
            dispatch({
              type: "open-request",
              title: example.title,
              request: example.request,
              apiShape: example.apiShape,
              ...(endpointSupportsShape(activeEndpoint, example.apiShape)
                ? { endpointPresetId: activeEndpoint.id }
                : {}),
              source: {
                kind: "example",
                fileName: `${example.title}.json`,
                canSaveBack: false,
              },
            });
          }}
        />
        <section className="playground-view">
          <TabStrip
            tabs={state.tabs}
            activeTabId={state.activeTabId}
            onActivate={(tabId) => dispatch({ type: "activate-tab", tabId })}
            onAdd={() => dispatch({ type: "add-tab" })}
            onClose={closeTab}
            onDuplicate={(tabId) => dispatch({ type: "duplicate-tab", tabId })}
          />
          <div className="prompt-toolbar">
            <div className="prompt-title">
              <button className="prompt-select" type="button">
                {activeTab.title}
                <ChevronDown size={14} />
              </button>
              <span className="status-chip">Draft</span>
              {activeTab.dirty ? <span className="muted">Unsaved changes</span> : null}
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="soft-button"
                onClick={() => dispatch({ type: "duplicate-tab", tabId: activeTab.id })}
              >
                <Copy size={15} /> Compare
              </button>
              <button type="button" className="soft-button" disabled>
                Optimize
              </button>
              <button type="button" className="soft-button" disabled>
                Evaluate
              </button>
              <button
                type="button"
                className="soft-button strong"
                disabled={!requestIsValid}
                onClick={() =>
                  downloadJson(
                    `${activeTab.title}.prompt.json`,
                    tabToPromptWorkspace(activeTab),
                  )
                }
              >
                <Save size={15} /> Save
              </button>
            </div>
          </div>
          <div className="columns">
            <PromptEditor
              tab={activeTab}
              endpoint={activeEndpoint}
              form={formState}
              rawJson={rawJson}
              jsonError={jsonError}
              onShapeChange={(apiShape) => {
                const adapter = adapterById(apiShape);
                updateActiveTab({
                  apiShape,
                  request: adapter.defaultRequest(activeTab.model),
                });
              }}
              onFormChange={updateForm}
              onRawJsonChange={applyRawJson}
              onImportFiles={(files) => void importFiles(files)}
            />
            <ResponsePanel
              tab={activeTab}
              canRun={requestIsValid}
              onRun={() => void runActiveTab()}
              onStop={stopRun}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

const TopBar = (): React.JSX.Element => (
  <header className="topbar">
    <div className="identity">
      <span className="avatar">L</span>
      <span>LocalModel Playground</span>
      <span className="slash">/</span>
      <span className="muted">Browser-only</span>
    </div>
    <nav className="topnav" aria-label="Top navigation">
      <a href="https://github.com/dutifuldev/localmodel-playground">GitHub</a>
      <a href="/docs/implementation-plan.md">Docs</a>
      <button className="avatar-button" type="button" aria-label="Settings">
        <Settings2 size={16} />
      </button>
    </nav>
  </header>
);

type SidebarProps = {
  readonly activeEndpoint: EndpointPreset;
  readonly endpoints: readonly EndpointPreset[];
  readonly models: readonly string[];
  readonly modelStatus: string;
  readonly activeTab: PlaygroundTab;
  readonly directoryAvailable: boolean;
  readonly onEndpointChange: (endpointId: string) => void;
  readonly onModelChange: (model: string) => void;
  readonly onDiscoverModels: () => void;
  readonly onImportFile: (file: File | undefined) => void;
  readonly onImportFiles: (files: FileList | null) => void;
  readonly onImportDirectory: () => void;
  readonly onLoadExample: (index: number) => void;
};

const Sidebar = (props: SidebarProps): React.JSX.Element => (
  <aside className="sidebar">
    <section className="nav-group">
      <p className="sidebar-label">Endpoint</p>
      <select
        value={props.activeEndpoint.id}
        onChange={(event) => props.onEndpointChange(event.currentTarget.value)}
      >
        {props.endpoints.map((endpoint) => (
          <option value={endpoint.id} key={endpoint.id}>
            {endpoint.name}
          </option>
        ))}
      </select>
      <code>{props.activeEndpoint.baseUrl}</code>
      <button type="button" className="full-button" onClick={props.onDiscoverModels}>
        Discover models
      </button>
      <p className="hint">{props.modelStatus}</p>
      <input
        value={props.activeTab.model}
        list="model-options"
        onChange={(event) => props.onModelChange(event.currentTarget.value)}
        aria-label="Model"
      />
      <datalist id="model-options">
        {props.models.map((model) => (
          <option value={model} key={model} />
        ))}
      </datalist>
    </section>
    <section className="nav-group">
      <p className="sidebar-label">Files</p>
      <label className="file-button">
        <Upload size={15} />
        Import JSON
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => props.onImportFile(event.currentTarget.files?.[0])}
        />
      </label>
      <label className="file-button">
        <FolderOpen size={15} />
        Import folder fallback
        <input
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          onChange={(event) => props.onImportFiles(event.currentTarget.files)}
        />
      </label>
      <button
        type="button"
        className="full-button"
        onClick={props.onImportDirectory}
        disabled={!props.directoryAvailable}
      >
        <FolderOpen size={15} /> Pick directory
      </button>
    </section>
    <section className="nav-group">
      <p className="sidebar-label">Examples</p>
      {examples.map((example, index) => (
        <button
          key={example.title}
          type="button"
          className="nav-item"
          onClick={() => props.onLoadExample(index)}
        >
          <FileJson size={15} />
          {example.title}
        </button>
      ))}
    </section>
    <section className="billing-note">
      <strong>CORS required</strong>
      <p>Local endpoints must allow browser origins. This app never proxies requests.</p>
    </section>
  </aside>
);

type TabStripProps = {
  readonly tabs: readonly PlaygroundTab[];
  readonly activeTabId: string;
  readonly onActivate: (tabId: string) => void;
  readonly onAdd: () => void;
  readonly onClose: (tabId: string) => void;
  readonly onDuplicate: (tabId: string) => void;
};

const TabStrip = (props: TabStripProps): React.JSX.Element => (
  <div className="tabstrip" role="tablist">
    {props.tabs.map((tab) => (
      <div className={`tab ${tab.id === props.activeTabId ? "active" : ""}`} key={tab.id}>
        <button type="button" role="tab" onClick={() => props.onActivate(tab.id)}>
          {tab.dirty ? "• " : ""}
          {tab.title}
        </button>
        <button
          type="button"
          aria-label={`Duplicate ${tab.title}`}
          onClick={() => props.onDuplicate(tab.id)}
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          aria-label={`Close ${tab.title}`}
          onClick={() => props.onClose(tab.id)}
        >
          <X size={12} />
        </button>
      </div>
    ))}
    <button className="add-tab" type="button" onClick={props.onAdd} aria-label="New tab">
      <Plus size={16} />
    </button>
  </div>
);

type PromptEditorProps = {
  readonly tab: PlaygroundTab;
  readonly endpoint: EndpointPreset;
  readonly form: ReturnType<typeof requestToFormState>;
  readonly rawJson: string;
  readonly jsonError: string | undefined;
  readonly onShapeChange: (shape: PlaygroundTab["apiShape"]) => void;
  readonly onFormChange: (form: ReturnType<typeof requestToFormState>) => void;
  readonly onRawJsonChange: (value: string | undefined) => void;
  readonly onImportFiles: (files: FileList | null) => void;
};

const PromptEditor = (props: PromptEditorProps): React.JSX.Element => {
  const addMessage = (): void => {
    const messages: MessageRow[] = [
      ...props.form.messages,
      { id: `message_${String(Date.now())}`, role: "user", content: "" },
    ];
    props.onFormChange({ ...props.form, messages });
  };

  return (
    <section className="editor-column">
      <div className="config-panel">
        <div className="section-header">
          <span>Model</span>
          <button className="icon-button" type="button" aria-label="Configure">
            <Settings2 size={16} />
          </button>
        </div>
        <div className="model-row">
          <select
            value={props.tab.apiShape}
            onChange={(event) =>
              props.onShapeChange(event.currentTarget.value as PlaygroundTab["apiShape"])
            }
          >
            {adapters.map((adapter) => (
              <option key={adapter.id} value={adapter.id}>
                {adapter.label}
              </option>
            ))}
          </select>
          <span
            className={
              endpointSupportsShape(props.endpoint, props.tab.apiShape) ? "ok" : "warn"
            }
          >
            {endpointSupportsShape(props.endpoint, props.tab.apiShape)
              ? "Runnable"
              : "Import/edit only"}
          </span>
        </div>
        <div className="pill-grid">
          <span>model: {props.form.model}</span>
          <span>temperature: {props.form.temperature}</span>
          <span>stream: {String(props.form.stream)}</span>
          <span>shape: {props.tab.apiShape}</span>
        </div>
      </div>
      <Section title="Variables" actionLabel="Add" />
      <Section title="Tools" actionLabel="Add" />
      <section className="message-panel">
        <div className="section-header">
          <span>Developer message</span>
          <button className="soft-button" type="button">
            Generate
          </button>
        </div>
        <textarea
          value={props.form.developerMessage}
          onChange={(event) =>
            props.onFormChange({ ...props.form, developerMessage: event.currentTarget.value })
          }
          placeholder="Add developer instructions..."
        />
      </section>
      <section className="message-panel">
        <div className="section-header">
          <span>Prompt messages</span>
          <button className="soft-button" type="button" onClick={addMessage}>
            Add message
          </button>
        </div>
        {props.form.messages.map((message, index) => (
          <div className="message-row" key={message.id}>
            <select
              value={message.role}
              onChange={(event) => {
                const messages = props.form.messages.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, role: event.currentTarget.value } : item,
                );
                props.onFormChange({ ...props.form, messages });
              }}
            >
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
              <option value="system">System</option>
              <option value="developer">Developer</option>
            </select>
            <textarea
              value={message.content}
              onChange={(event) => {
                const messages = props.form.messages.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, content: event.currentTarget.value } : item,
                );
                props.onFormChange({ ...props.form, messages });
              }}
              placeholder="Message content..."
            />
          </div>
        ))}
      </section>
      <section className="json-panel">
        <div className="section-header">
          <span>
            <Braces size={15} /> Request JSON
          </span>
          <label className="mini-file">
            <Upload size={14} />
            Import
            <input
              type="file"
              multiple
              accept=".json,application/json"
              onChange={(event) => props.onImportFiles(event.currentTarget.files)}
            />
          </label>
        </div>
        {props.jsonError ? <p className="schema-error">{props.jsonError}</p> : null}
        <Editor
          height="280px"
          language="json"
          theme="vs"
          value={props.rawJson}
          options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
          onChange={props.onRawJsonChange}
        />
      </section>
    </section>
  );
};

const Section = (props: {
  readonly title: string;
  readonly actionLabel: string;
}): React.JSX.Element => (
  <section className="config-panel slim">
    <div className="section-header">
      <span>{props.title}</span>
      <button className="soft-button" type="button">
        <Plus size={14} /> {props.actionLabel}
      </button>
    </div>
  </section>
);

const ResponsePanel = (props: {
  readonly tab: PlaygroundTab;
  readonly canRun: boolean;
  readonly onRun: () => void;
  readonly onStop: () => void;
}): React.JSX.Element => {
  const run = props.tab.currentRun ?? props.tab.lastRun;
  const isRunning = props.tab.currentRun?.status === "running";
  return (
    <section className="response-column">
      <ResponseBody run={run} />
      <div className="composer">
        <textarea value="Chat with your prompt..." readOnly aria-label="Chat composer" />
        <div className="composer-actions">
          <button
            type="button"
            className="soft-button"
            disabled={!props.tab.lastRun}
            onClick={() =>
              props.tab.lastRun &&
              downloadJson(runRecordFileName(props.tab.lastRun), props.tab.lastRun)
            }
          >
            <FileDown size={15} /> Export run
          </button>
          {isRunning ? (
            <button
              className="run-button"
              type="button"
              onClick={props.onStop}
              aria-label="Stop"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              className="run-button"
              type="button"
              onClick={props.onRun}
              aria-label="Run"
              disabled={!props.canRun}
            >
              <Play size={18} />
            </button>
          )}
          <button className="icon-button" type="button" aria-label="Clear history">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </section>
  );
};

const ResponseBody = (props: { readonly run: RunRecord | undefined }): React.JSX.Element => (
  <div className="response-body">
    {props.run ? <RunOutput run={props.run} /> : <EmptyConversation />}
  </div>
);

const RunOutput = (props: { readonly run: RunRecord }): React.JSX.Element => {
  const text = props.run.parsed?.text ?? "";
  return (
    <div className="run-output">
      <div className="run-status">
        <span className={`status-dot ${props.run.status}`} />
        <strong>{props.run.status}</strong>
        {props.run.metrics?.latencyMs ? <span>{props.run.metrics.latencyMs}ms</span> : null}
      </div>
      {props.run.error ? (
        <div className="error-box">
          <AlertCircle size={16} />
          {props.run.error.message}
        </div>
      ) : (
        <pre>{text || stableStringify(props.run.response ?? {})}</pre>
      )}
    </div>
  );
};

const EmptyConversation = (): React.JSX.Element => (
  <div className="empty-conversation">
    <PanelLeftClose size={36} />
    <p>Your conversation will appear here</p>
  </div>
);
