import { afterEach, describe, expect, it, vi } from "vitest";

import { canPickDirectory, pickDirectoryRequests } from "./directoryImport";

type TestFileHandle = {
  readonly kind: "file";
  readonly name: string;
  readonly getFile: () => Promise<File>;
};

type TestDirectoryHandle = {
  readonly kind: "directory";
  readonly name: string;
  readonly values: () => AsyncIterable<TestDirectoryHandle | TestFileHandle>;
};

describe("directory import", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "showDirectoryPicker");
  });

  it("reports picker availability and throws when unavailable", async () => {
    expect(canPickDirectory()).toBe(false);
    await expect(pickDirectoryRequests()).rejects.toThrow("Directory picker is not available");
  });

  it("recursively imports JSON files from picked directories", async () => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: vi.fn(() =>
        Promise.resolve(
          directory("root", [
            file("first.json", '{"model":"local","prompt":"one"}'),
            file("bad.json", "{"),
            file("notes.txt", "ignore"),
            directory("nested", [file("second.json", '{"model":"local","input":"two"}')]),
          ]),
        ),
      ),
    });

    expect(canPickDirectory()).toBe(true);
    const imported = await pickDirectoryRequests();

    expect(imported.map((item) => item.title)).toEqual(["first", "second"]);
    expect(imported.map((item) => item.source.relativePath)).toEqual([
      "root/first.json",
      "root/nested/second.json",
    ]);
  });
});

const file = (name: string, source: string): TestFileHandle => ({
  kind: "file",
  name,
  getFile: () => Promise.resolve(textFile(source, name)),
});

const directory = (
  name: string,
  children: readonly (TestDirectoryHandle | TestFileHandle)[],
): TestDirectoryHandle => ({
  kind: "directory",
  name,
  values: async function* values() {
    for (const child of children) {
      await Promise.resolve();
      yield child;
    }
  },
});

const textFile = (source: string, name: string): File => {
  const fileValue = new File([source], name, { type: "application/json" });
  Object.defineProperty(fileValue, "text", {
    value: () => Promise.resolve(source),
  });
  return fileValue;
};
