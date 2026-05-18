import type { EndpointPreset } from "../../../shared/types";

export const openAiRequestHeaders = (endpoint: EndpointPreset): HeadersInit => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (endpoint.auth.type === "bearer" && endpoint.auth.token) {
    headers["authorization"] = `Bearer ${endpoint.auth.token}`;
  }
  if (endpoint.auth.type === "header" && endpoint.auth.headerValue) {
    headers[endpoint.auth.headerName] = endpoint.auth.headerValue;
  }
  return headers;
};
