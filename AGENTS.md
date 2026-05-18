# AGENTS.md

These instructions apply to this repository.

## Required Checks

Run these before finishing code changes:

```sh
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run slophammer
```

Run `npm run coverage` for behavior changes that touch request adapters, state, streaming, file import/export, or validation.

## TypeScript Rules

- Keep `strict` TypeScript clean.
- Do not use explicit `any`.
- Validate unknown imported JSON and network responses before converting them into typed domain data.
- Keep request-shape adapters independent from React components and browser IO.
- Keep browser IO in `src/playground/files`, `src/playground/endpoints`, or `src/playground/runs`.

## Architecture

- This app is browser-only. Do not add a backend, proxy server, hosted API route, Electron wrapper, or Tauri wrapper unless the plan is explicitly changed.
- Do not store secrets in exported files. Auth values must remain browser-local and redacted from exports by default.
- Follow Slophammer TypeScript standards. The operational reference is `/home/bob/repos/slophammer/docs/AGENT_ENTRYPOINT.md`.
