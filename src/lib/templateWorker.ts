import { loadCar, loadLogo, openPackage } from './templatePackage.ts';
import type { CarTemplate, WorkerRequest, WorkerResponse } from './templateTypes.ts';

// A module worker's global scope, typed without pulling the WebWorker lib into the DOM program.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

scope.onmessage = async ({ data: request }) => {
  try {
    let result: unknown;
    let transfer: Transferable[] = [];
    switch (request.method) {
      case 'open':
        result = await openPackage(request.file);
        break;
      case 'loadCar': {
        const car: CarTemplate = await loadCar(request.path);
        transfer = car.layers.map((l) => l.bitmap);
        result = car;
        break;
      }
      case 'loadLogo':
        result = await loadLogo(request.path);
        break;
    }
    scope.postMessage({ id: request.id, ok: true, result }, transfer);
  } catch (err) {
    scope.postMessage({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
