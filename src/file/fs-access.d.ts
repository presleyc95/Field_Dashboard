/**
 * Parts of the File System Access API that Chrome and Edge support but TypeScript's DOM types
 * don't include yet.
 */
export {};

declare global {
  type FileSystemPermissionMode = "read" | "readwrite";

  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  }

  interface Window {
    showDirectoryPicker(options?: {
      id?: string;
      mode?: FileSystemPermissionMode;
      startIn?: "desktop" | "documents" | "downloads" | FileSystemHandle;
    }): Promise<FileSystemDirectoryHandle>;
  }
}
