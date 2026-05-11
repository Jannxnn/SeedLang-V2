export function createStore(initialState) {
  const state = { ...initialState };
  const listeners = [];

  function getState() {
    return state;
  }

  function setState(patch) {
    Object.assign(state, patch);
    listeners.forEach((fn) => fn(state));
  }

  function subscribe(fn) {
    listeners.push(fn);
    fn(state);
  }

  return { getState, setState, subscribe };
}

