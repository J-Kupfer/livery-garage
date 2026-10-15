import type { CarTemplate, LogoImage, PackageIndex, WorkerRequest, WorkerResponse } from './templateTypes.ts';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Main-thread handle to the template worker. */
export class TemplateClient {
  private readonly worker = new Worker(new URL('./templateWorker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.ok) pending.resolve(data.result);
      else pending.reject(new Error(data.error));
    };
    this.worker.onerror = (event) => {
      // A crashed worker (e.g. out of memory) never answers; fail everything that waits.
      const error = new Error(event.message || 'Der Vorlagen-Worker ist abgestürzt.');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  private call<T>(request: DistributiveOmit<WorkerRequest, 'id'>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  open(file: Blob): Promise<PackageIndex> {
    return this.call({ method: 'open', file });
  }

  loadCar(path: string): Promise<CarTemplate> {
    return this.call({ method: 'loadCar', path });
  }

  loadLogo(path: string): Promise<LogoImage> {
    return this.call({ method: 'loadLogo', path });
  }
}
