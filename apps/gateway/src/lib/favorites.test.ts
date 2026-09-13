import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readWeb(file: string): string {
  const p = resolve(process.cwd(), file);
  try { return readFileSync(p, "utf-8"); } catch {
    const alt = resolve(process.cwd(), "../../" + file);
    return readFileSync(alt, "utf-8");
  }
}

describe("Favorite models — lib/favorites + hook", () => {
  it("favorites.ts exports persistence helpers", () => {
    const txt = readWeb("apps/web/src/lib/favorites.ts");
    expect(txt).toContain("FAVORITES_KEY");
    expect(txt).toContain("favoriteModels");
    expect(txt).toContain("FAVORITES_EVENT");
    expect(txt).toContain("getFavoriteIds");
    expect(txt).toContain("getFavoriteSet");
    expect(txt).toContain("setFavoriteIds");
    expect(txt).toContain("toggleFavorite");
    expect(txt).toContain("isFavorite");
    expect(txt).toContain("localStorage.getItem");
    expect(txt).toContain("localStorage.setItem");
    expect(txt).toContain("favorites-updated");
  });

  it("useFavoriteModels hook combines ALLOWED + favorites", () => {
    const txt = readWeb("apps/web/src/features/chat/hooks/useFavoriteModels.ts");
    expect(txt).toContain("useFavoriteModels");
    expect(txt).toContain("getFavoriteIds");
    expect(txt).toContain("ALLOWED_CHAT_MODELS");
    expect(txt).toContain("combinedIds");
    expect(txt).toContain("combinedSet");
    expect(txt).toContain("favoriteSet");
    expect(txt).toContain("FAVORITES_EVENT");
    expect(txt).toContain("FAVORITES_KEY");
    expect(txt).toContain("window.addEventListener");
  });
});

describe("Favorite models — Models page", () => {
  it("Models.tsx has star column, favOnly filter, favorites state", () => {
    const txt = readWeb("apps/web/src/pages/Models.tsx");
    expect(txt).toContain("favorites");
    expect(txt).toContain("favOnly");
    expect(txt).toContain("FAVORITES_KEY");
    expect(txt).toContain("FAVORITES_EVENT");
    expect(txt).toContain("toggleFav");
    expect(txt).toContain('Star');
    expect(txt).toContain('t("models.favorites_only")');
    expect(txt).toContain('t("models.th_fav")');
    expect(txt).toContain("modelsFavOnly");
    // filter logic
    expect(txt).toContain("favorites.has(m.id)");
    // checkbox inside Filters dropdown only (no outer standalone button)
    expect(txt).toContain('checked={favOnly}');
  });

  it("Models.tsx persists favorites to localStorage and dispatches event", () => {
    const txt = readWeb("apps/web/src/pages/Models.tsx");
    expect(txt).toContain('localStorage.setItem(FAVORITES_KEY');
    expect(txt).toContain('new CustomEvent(FAVORITES_EVENT)');
  });
});

describe("Favorite models — Chat page integration", () => {
  it("Chat.tsx uses useFavoriteModels and expands allowed list", () => {
    const txt = readWeb("apps/web/src/pages/Chat.tsx");
    expect(txt).toContain("useFavoriteModels");
    expect(txt).toContain("favoriteSet");
    expect(txt).toContain("combinedIds");
    expect(txt).toContain("favoriteSet.has");
    // still re-exports ALLOWED_CHAT_MODELS with 6 ids (not enlarged)
    expect(txt).toContain("ALLOWED_CHAT_MODELS");
    expect(txt).toContain('from "../features/chat/hooks/useFavoriteModels');
  });

  it("Chat.tsx fetch merges ALLOWED + favorites", () => {
    const txt = readWeb("apps/web/src/pages/Chat.tsx");
    expect(txt).toContain("ids.map((id)");
    expect(txt).toContain("FALLBACK_CONTEXT");
    expect(txt).toContain("live_status");
  });

  it("ChatHeader.tsx groups favorites on top with Star", () => {
    const txt = readWeb("apps/web/src/features/chat/components/ChatHeader.tsx");
    expect(txt).toContain("favoriteSet");
    expect(txt).toContain("Star");
    expect(txt).toContain("favoritesInView");
    expect(txt).toContain("nonFavoritesInView");
    expect(txt).toContain('t("chat.favorites")');
    expect(txt).toContain('t("chat.default_models")');
    expect(txt).toContain("fill-amber-400");
  });

  it("ChatHeader shows star on selectedModel if favorited", () => {
    const txt = readWeb("apps/web/src/features/chat/components/ChatHeader.tsx");
    expect(txt).toContain("favoriteSet?.has(selectedModel)");
  });
});

describe("Favorite models — i18n VI/EN", () => {
  it("i18n.tsx has favorite keys for Models and Chat (VI/EN)", () => {
    const txt = readWeb("apps/web/src/lib/i18n.tsx");
    const required = [
      "models.favorite",
      "models.favorites_only",
      "models.favorites_tip",
      "models.th_fav",
      "models.add_fav",
      "models.remove_fav",
      "chat.favorites",
      "chat.favorites_hint",
      "chat.no_favorites",
      "chat.default_models",
    ];
    for (const k of required) {
      expect(txt).toContain(`"${k}"`);
    }
    // ensure both vi and en sections contain them (>=2 occurrences per key)
    for (const k of required) {
      const count = (txt.match(new RegExp(`"${k}"`, "g")) || []).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});
