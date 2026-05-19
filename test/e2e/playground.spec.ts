/* eslint-disable complexity */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "@playwright/test";

test.describe("browser playground", () => {
  test("matches the captured OpenAI playground layout structure on desktop", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Desktop reference check.");

    await page.goto("/");
    await expect(page.getByText("LocalModel Playground")).toBeVisible();
    await expect(page.getByRole("tab", { name: /New prompt/u })).toBeVisible();
    await expect(page.getByText("Developer message")).toBeVisible();

    const bodyColor = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyColor).toBe("rgb(243, 243, 243)");

    const sidebar = await page.locator(".sidebar").boundingBox();
    const workspace = await page.locator(".workspace").boundingBox();
    const composer = await page.getByLabel("Chat composer").boundingBox();
    const runButton = await page.getByLabel("Run").boundingBox();

    expect(sidebar?.width).toBeGreaterThanOrEqual(200);
    expect(sidebar?.width).toBeLessThanOrEqual(230);
    expect(workspace?.y).toBeGreaterThanOrEqual(50);
    expect(workspace?.width).toBeGreaterThan(1_300);
    expect(composer?.y).toBeGreaterThan(820);
    expect(composer?.height).toBeGreaterThanOrEqual(48);
    expect(runButton?.width).toBeGreaterThanOrEqual(34);
    expect(runButton?.height).toBeGreaterThanOrEqual(34);
    expect(Math.abs((runButton?.width ?? 0) - (runButton?.height ?? 0))).toBeLessThanOrEqual(4);
  });

  test("runs an OpenAI-compatible prompt from the browser", async ({ page }) => {
    let requestBody = "";
    await page.route("http://127.0.0.1:4321/v1/chat/completions", async (route) => {
      requestBody = route.request().postData() ?? "";
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
        }),
      });
    });

    await page.goto("/");
    await page.getByLabel("Endpoint base URL").fill("http://127.0.0.1:4321/v1");
    await page.getByLabel("Model").fill("chosen-model");
    await expect(page.locator(".json-panel")).toContainText('"model": "chosen-model"');
    await page.getByLabel("Chat composer").fill("Say pong through the composer.");
    await page.getByLabel("Run").click();

    await expect(page.getByText("succeeded")).toBeVisible();
    await expect(page.locator(".run-output pre").filter({ hasText: "pong" })).toBeVisible();
    expect(requestBody).toContain("Say pong through the composer.");
    expect(requestBody).toContain("chosen-model");
  });

  test("renders streaming output while a local endpoint is still responding", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Desktop streaming check.");

    let finishStream: () => void = () => undefined;
    const finishStreamPromise = new Promise<void>((resolve) => {
      finishStream = resolve;
    });
    const server = createStreamingServer(finishStreamPromise);
    const port = await listen(server);
    try {
      await page.goto("/");
      await page.getByLabel("Endpoint base URL").fill(`http://127.0.0.1:${String(port)}/v1`);
      await page.getByLabel("Model").fill("stream-model");
      await page.getByLabel("Chat composer").fill("Stream a response.");
      await page.getByLabel("Run").click();

      await expect(page.getByLabel("Stop")).toBeVisible();
      await expect(page.locator(".run-output pre").filter({ hasText: "hello" })).toBeVisible();
      await expect(page.locator(".run-status")).toContainText(/tok\/s/u);
      finishStream();
      await expect(
        page.locator(".run-output pre").filter({ hasText: "hello world" }),
      ).toBeVisible();
      await expect(page.getByText("succeeded")).toBeVisible();
      await expect(page.locator(".run-status")).toContainText(/ms/u);
    } finally {
      await closeServer(server);
    }
  });

  test("keeps the full playground usable on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "Mobile viewport check.");

    await page.goto("/");

    await expect(page.getByRole("tab", { name: /New prompt/u })).toBeVisible();
    await expect(page.locator(".sidebar-label").filter({ hasText: "Endpoint" })).toBeVisible();
    await expect(page.getByText("Prompt messages")).toBeVisible();
    await expect(page.getByLabel("Run")).toBeVisible();

    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = page.viewportSize()?.width ?? documentWidth;
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth + 2);
  });
});

const createStreamingServer = (finishStream: Promise<void>): Server =>
  createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response
        .writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "POST, OPTIONS",
        })
        .end();
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      "access-control-allow-origin": "*",
      "content-type": "text/event-stream",
    });
    response.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
    void finishStream.then(() => {
      response.write('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');
      response.end("data: [DONE]\n\n");
    });
  });

const listen = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
