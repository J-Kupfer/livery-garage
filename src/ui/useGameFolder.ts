import { useCallback, useEffect, useState } from 'react';
import { idbDelete, idbGet, idbSet } from '../lib/storage.ts';

const HANDLE_KEY = 'liveryDir';

/**
 * unsupported: the browser has no File System Access API (only Chrome and Edge do).
 * needs-permission: a folder was chosen in an earlier visit; the browser asks again after a reload.
 */
export type GameFolderState = 'unsupported' | 'disconnected' | 'needs-permission' | 'ready';

export function useGameFolder() {
  const supported = typeof window.showDirectoryPicker === 'function';
  const [handle, setHandle] = useState<FileSystemDirectoryHandle>();
  const [state, setState] = useState<GameFolderState>(supported ? 'disconnected' : 'unsupported');

  useEffect(() => {
    if (!supported) return;
    void idbGet<FileSystemDirectoryHandle>(HANDLE_KEY).then(async (stored) => {
      if (!stored) return;
      setHandle(stored);
      const permission = await stored.queryPermission({ mode: 'readwrite' });
      setState(permission === 'granted' ? 'ready' : 'needs-permission');
    });
  }, [supported]);

  /** Lets the user pick the LocalLiveries folder. Resolves undefined when the picker is cancelled. */
  const choose = useCallback(async (): Promise<FileSystemDirectoryHandle | undefined> => {
    try {
      const picked = await window.showDirectoryPicker!({ id: 'otl-local-liveries', mode: 'readwrite', startIn: 'documents' });
      await idbSet(HANDLE_KEY, picked);
      setHandle(picked);
      setState('ready');
      return picked;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return undefined;
      throw err;
    }
  }, []);

  /** Must run inside a click handler: browsers only show the permission prompt after a user gesture. */
  const ensureAccess = useCallback(async (): Promise<FileSystemDirectoryHandle | undefined> => {
    if (!handle) return undefined;
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    setState(permission === 'granted' ? 'ready' : 'needs-permission');
    return permission === 'granted' ? handle : undefined;
  }, [handle]);

  const disconnect = useCallback(async () => {
    await idbDelete(HANDLE_KEY);
    setHandle(undefined);
    setState('disconnected');
  }, []);

  return { state, handle, choose, ensureAccess, disconnect };
}
