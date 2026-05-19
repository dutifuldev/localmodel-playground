export const explainEndpointError = (error: unknown, url: string): string => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return [
      `The browser could not reach ${url}.`,
      ...loopbackGuidance(url),
      "For local model servers, confirm the server is running and allows browser CORS requests.",
      "LM Studio and vLLM should expose Access-Control-Allow-Origin for this app origin. Ollama may require OLLAMA_ORIGINS to include the app URL.",
    ].join(" ");
  }

  return message;
};

export const endpointScopeHint = (appHost: string, endpointUrl: string): string | undefined => {
  if (!isLoopbackEndpoint(endpointUrl) || isLoopbackHost(appHost)) {
    return undefined;
  }

  return [
    "This loopback endpoint is resolved by the browser device.",
    "If your model server is on this Tailscale host, use its Tailscale address instead of 127.0.0.1.",
  ].join(" ");
};

const loopbackGuidance = (url: string): readonly string[] =>
  isLoopbackEndpoint(url)
    ? [
        "Because this is a loopback endpoint, it must be running on the same device as the browser.",
        "If the model server is on another machine, use that machine's reachable LAN or Tailscale address.",
      ]
    : [];

const isLoopbackEndpoint = (url: string): boolean => {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
};

const isLoopbackHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
