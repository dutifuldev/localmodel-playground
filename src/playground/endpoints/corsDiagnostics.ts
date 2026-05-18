export const explainEndpointError = (error: unknown, url: string): string => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return [
      `The browser could not reach ${url}.`,
      "For local model servers, confirm the server is running and allows browser CORS requests.",
      "LM Studio and vLLM should expose Access-Control-Allow-Origin for this app origin. Ollama may require OLLAMA_ORIGINS to include the app URL.",
    ].join(" ");
  }

  return message;
};
