/* eslint-disable complexity */
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
    await page.route("http://127.0.0.1:1234/v1/chat/completions", async (route) => {
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
    await page.getByLabel("Chat composer").fill("Say pong through the composer.");
    await page.getByLabel("Run").click();

    await expect(page.getByText("succeeded")).toBeVisible();
    await expect(page.locator(".run-output pre").filter({ hasText: "pong" })).toBeVisible();
    expect(requestBody).toContain("Say pong through the composer.");
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
