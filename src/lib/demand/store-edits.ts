/**
 * A location fetch that started before a save can return the old list and
 * wipe a pin that already committed. Edits made during that fetch are applied
 * on top of the response so the pin stays until the next read sees it.
 */

export type StoreEdit<T extends { id: string }> =
  | { n: number; op: "add"; store: T }
  | { n: number; op: "remove"; id: string }
  | { n: number; op: "patch"; id: string; patch: Partial<T> };

export function applyStoreEdits<T extends { id: string }>(fetched: T[], edits: StoreEdit<T>[]): T[] {
  const removed = new Set<string>();
  const patches = new Map<string, Partial<T>>();
  const added = new Map<string, T>();
  for (const edit of edits.slice().sort((a, b) => a.n - b.n)) {
    if (edit.op === "remove") {
      removed.add(edit.id);
      added.delete(edit.id);
      continue;
    }
    if (edit.op === "add") {
      removed.delete(edit.store.id);
      added.set(edit.store.id, edit.store);
      continue;
    }
    patches.set(edit.id, { ...(patches.get(edit.id) || {}), ...edit.patch });
  }
  const out: T[] = [];
  const seen = new Set<string>();
  const paint = (store: T): T => {
    const patch = patches.get(store.id);
    return patch ? { ...store, ...patch } : store;
  };
  for (const store of fetched) {
    if (removed.has(store.id)) continue;
    out.push(paint(added.get(store.id) || store));
    seen.add(store.id);
  }
  for (const store of Array.from(added.values())) {
    if (seen.has(store.id) || removed.has(store.id)) continue;
    out.push(paint(store));
  }
  return out;
}
