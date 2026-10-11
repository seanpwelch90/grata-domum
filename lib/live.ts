type Listener = (event: string) => void;

const listeners = new Set<Listener>();

export function publish(event: { type: string; id?: string }) {
  const payload = JSON.stringify(event);
  for (const listener of listeners) listener(payload);
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
