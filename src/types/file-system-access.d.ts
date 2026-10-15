// Parts of the File System Access API that TypeScript's DOM lib does not ship yet
// (Chromium only: Chrome and Edge on Windows, which is where the game runs).

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads';
  }): Promise<FileSystemDirectoryHandle>;
}
