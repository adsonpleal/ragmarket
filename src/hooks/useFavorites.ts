import { useCallback, useMemo } from "react";
import { usePersistentValue } from "./usePersistentValue";

const EMPTY: number[] = [];

export function useFavorites() {
  const [list, setList] = usePersistentValue<number[]>({
    key: "ragmarket.favorites",
    defaultValue: EMPTY,
    parse: (raw) =>
      Array.isArray(raw)
        ? raw.filter((x): x is number => typeof x === "number" && x > 0)
        : null,
    serialize: (v) => JSON.stringify(v),
  });

  const favorites = useMemo(() => new Set(list), [list]);

  const toggle = useCallback(
    (id: number) => {
      if (!Number.isFinite(id) || id <= 0) return;
      const next = new Set(list);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setList(Array.from(next));
    },
    [list, setList],
  );

  // Returns true if the ID was added, false if invalid or already favorited.
  // Unlike `toggle`, calling this twice with the same ID is a no-op the
  // second time — which is what the "add by ID" input needs.
  const add = useCallback(
    (id: number): boolean => {
      if (!Number.isFinite(id) || id <= 0) return false;
      if (list.includes(id)) return false;
      setList([...list, id]);
      return true;
    },
    [list, setList],
  );

  const isFavorite = useCallback((id: number) => favorites.has(id), [favorites]);

  return { favorites, toggle, add, isFavorite };
}
