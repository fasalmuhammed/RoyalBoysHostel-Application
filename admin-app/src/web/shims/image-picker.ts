/**
 * Browser stand-in for `expo-image-picker`.
 *
 * The artifact frame refuses camera APIs, but a file input still works, and on
 * a phone `capture="environment"` opens the camera app through it. So both
 * "Take photo" and "Choose from gallery" are file inputs; permission prompts
 * have nothing to ask and always report granted.
 *
 * The picked image is returned as a `blob:` URI, which services/photos.ts
 * compresses and uploads, exactly where the native flow would hand it a
 * `file://` URI.
 */

export interface ImagePickerAsset {
  uri: string;
  width: number;
  height: number;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

export type ImagePickerResult =
  | { canceled: true; assets: null }
  | { canceled: false; assets: ImagePickerAsset[] };

export interface ImagePickerOptions {
  mediaTypes?: string[] | string;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
}

const GRANTED = { granted: true, status: "granted", canAskAgain: true, expires: "never" } as const;

export async function requestCameraPermissionsAsync() {
  return GRANTED;
}

export async function requestMediaLibraryPermissionsAsync() {
  return GRANTED;
}

export async function getCameraPermissionsAsync() {
  return GRANTED;
}

export async function getMediaLibraryPermissionsAsync() {
  return GRANTED;
}

function pick(useCamera: boolean): Promise<ImagePickerResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (useCamera) input.setAttribute("capture", "environment");
    input.style.display = "none";

    let settled = false;
    const finish = (result: ImagePickerResult) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ canceled: true, assets: null });
        return;
      }
      finish({
        canceled: false,
        assets: [
          {
            uri: URL.createObjectURL(file),
            width: 0,
            height: 0,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
          },
        ],
      });
    });
    // Browsers that report a dismissed picker fire `cancel`; others never
    // settle, which leaves the caller waiting exactly as an open picker would.
    input.addEventListener("cancel", () => finish({ canceled: true, assets: null }));

    document.body.appendChild(input);
    input.click();
  });
}

export function launchCameraAsync(_options?: ImagePickerOptions): Promise<ImagePickerResult> {
  return pick(true);
}

export function launchImageLibraryAsync(_options?: ImagePickerOptions): Promise<ImagePickerResult> {
  return pick(false);
}

export const MediaTypeOptions = { Images: "Images", Videos: "Videos", All: "All" } as const;
