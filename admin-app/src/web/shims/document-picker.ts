/**
 * Browser stand-in for `expo-document-picker`.
 *
 * A file input reads the chosen file into the in-memory file system, so the
 * backup reader opens it through the same `File` API it uses on a phone.
 */
import { writeVirtualFile } from "./file-system";

export interface DocumentPickerAsset {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  lastModified?: number;
}

export type DocumentPickerResult =
  | { canceled: true; assets: null }
  | { canceled: false; assets: DocumentPickerAsset[] };

let counter = 0;

export function getDocumentAsync(_options?: {
  type?: string | string[];
  copyToCacheDirectory?: boolean;
  multiple?: boolean;
}): Promise<DocumentPickerResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";

    let settled = false;
    const finish = (result: DocumentPickerResult) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ canceled: true, assets: null });
        return;
      }
      counter += 1;
      const uri = `file:///cache/picked/${counter}/${encodeURIComponent(file.name)}`;
      writeVirtualFile(uri, new Uint8Array(await file.arrayBuffer()));
      finish({
        canceled: false,
        assets: [{ uri, name: file.name, size: file.size, mimeType: file.type, lastModified: file.lastModified }],
      });
    });
    input.addEventListener("cancel", () => finish({ canceled: true, assets: null }));

    document.body.appendChild(input);
    input.click();
  });
}
