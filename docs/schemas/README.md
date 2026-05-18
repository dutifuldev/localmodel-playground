# Playground Schemas

This directory defines the versioned persisted data contracts for LocalModel Playground.

Implementation rule: any JSON persisted to browser storage or exported to disk must either match one of these schemas or be raw provider request JSON loaded through an API-shape adapter.

Initial schemas to maintain:

- `playground-state.v1.schema.json`: browser-local state for the whole app.
- `playground-tab.v1.schema.json`: one self-contained tab/playground view.
- `endpoint-preset.v1.schema.json`: local endpoint configuration without exported secrets.
- `request-envelope.v1.schema.json`: optional wrapper around raw API request JSON.
- `prompt-workspace.v1.schema.json`: saved prompt workspace containing one or more tabs.
- `run-record.v1.schema.json`: saved run metadata, response, and metrics.

Rules:

- Keep schemas additive when practical.
- Add migration functions for every breaking schema change.
- Preserve unknown fields where practical during load/save.
- Never export bearer tokens, cookies, passwords, or local auth headers by default.
- Surface validation errors with JSON pointer paths in the playground schema diagnostics panel.

