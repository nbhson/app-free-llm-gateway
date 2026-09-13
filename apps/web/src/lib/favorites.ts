export const FAVORITES_KEY = "favoriteModels";
export const FAVORITES_EVENT = "favorites-updated";

export function getFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string" && v.trim().length > 0);
    return [];
  } catch {
    return [];
  }
}

export function getFavoriteSet(): Set<string> {
  return new Set(getFavoriteIds());
}

export function setFavoriteIds(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  } catch { /* ignore */ }
}

export function toggleFavorite(id: string): string[] {
  const cur = getFavoriteIds();
  const set = new Set(cur);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const next = [...set];
  setFavoriteIds(next);
  return next;
}

export function isFavorite(id: string): boolean {
  return getFavoriteSet().has(id);
}
