import { type Input, type TuiState, initState, reduce } from "./store.js";

/** Tiny observable around the pure reducer — bridges async runner events and
 *  keypresses into React via `useSyncExternalStore`. No React import here. */
export interface Store {
  getState(): TuiState;
  dispatch(input: Input): void;
  subscribe(listener: () => void): () => void;
}

export function createStore(rootDir: string): Store {
  let state = initState(rootDir);
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(input) {
      state = reduce(state, input);
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
