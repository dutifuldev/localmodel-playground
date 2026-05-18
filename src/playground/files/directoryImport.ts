import { tryImportRequestFile, type ImportedRequest } from "./fileImport";

type BrowserFileHandle = {
  readonly kind: "file";
  readonly name: string;
  readonly getFile: () => Promise<File>;
};

type BrowserDirectoryHandle = {
  readonly kind: "directory";
  readonly name: string;
  readonly values: () => AsyncIterable<BrowserDirectoryHandle | BrowserFileHandle>;
};

type DirectoryPickerWindow = Window & {
  readonly showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>;
};

export const canPickDirectory = (): boolean =>
  typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";

export const pickDirectoryRequests = async (): Promise<readonly ImportedRequest[]> => {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error("Directory picker is not available in this browser.");
  }

  const directory = await picker();
  return readDirectory(directory, directory.name);
};

const readDirectory = async (
  directory: BrowserDirectoryHandle,
  prefix: string,
): Promise<readonly ImportedRequest[]> => {
  const imported: ImportedRequest[] = [];
  for await (const handle of directory.values()) {
    const relativePath = `${prefix}/${handle.name}`;
    if (isDirectoryHandle(handle)) {
      imported.push(...(await readDirectory(handle, relativePath)));
    } else if (handle.name.endsWith(".json")) {
      const request = await tryImportRequestFile(await handle.getFile(), relativePath);
      if (request) {
        imported.push(request);
      }
    }
  }
  return imported;
};

const isDirectoryHandle = (
  handle: BrowserDirectoryHandle | BrowserFileHandle,
): handle is BrowserDirectoryHandle => handle.kind === "directory";
