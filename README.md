# LocalModel Playground

A simplified OpenAI-style playground for constructing, editing, versioning, loading, and running prompt/API requests against local model servers such as LM Studio, Ollama, and vLLM.

## Run Locally

```sh
npm install
npm run dev
```

Open the printed Vite URL in a browser. Endpoint calls are made directly from the browser, so local model servers must allow CORS for the app origin.

## Checks

```sh
npm run format
npm run lint
npm run typecheck
npm run coverage
npm run build
npm run test:e2e
npm run slophammer
npm run mutate
```

See [docs/implementation-plan.md](docs/implementation-plan.md) for the initial product and engineering plan.
