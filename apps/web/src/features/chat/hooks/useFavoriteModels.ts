import { useEffect, useMemo, useState } from "react";
import { FAVORITES_EVENT, FAVORITES_KEY, getFavoriteIds } from "../../../lib/favorites.ts";
import { ALLOWED_CHAT_MODELS as _ALLOWED } from "../types";

export function useFavoriteModels() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteIds());
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const combinedIds = useMemo(() => {
    const s = new Set<string>(_ALLOWED as unknown as string[]);
    for (const id of favoriteIds) if (id && !s.has(id)) s.add(id);
    return [...s];
  }, [favoriteIds]);
  const combinedSet = useMemo(() => new Set(combinedIds), [combinedIds]);

  useEffect(() => {
    const onFav = () => {
      try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        setFavoriteIds(raw ? (JSON.parse(raw) as string[]) : []);
      } catch { /* ignore */ }
    };
    window.addEventListener(FAVORITES_EVENT, onFav);
    window.addEventListener("storage", onFav as EventListener);
    return () => {
      window.removeEventListener(FAVORITES_EVENT, onFav);
      window.removeEventListener("storage", onFav as EventListener);
    };
  }, []);

  return { favoriteIds, favoriteSet, combinedIds, combinedSet };
}
