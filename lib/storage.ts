// lib/storage.ts: tiny localStorage helpers (client only). No tokens ever leave
// the browser except as request headers.

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked, non-fatal */
  }
}

export function getCreatorToken(slug: string): string | null {
  return safeGet(`freewhen:creator:${slug}`);
}

export function getMyMember(
  slug: string,
): { id: string; token: string } | null {
  const id = safeGet(`freewhen:memberid:${slug}`);
  const token = safeGet(`freewhen:member:${slug}`);
  if (id && token) return { id, token };
  return null;
}

export function setMyMember(slug: string, id: string, token: string): void {
  safeSet(`freewhen:memberid:${slug}`, id);
  safeSet(`freewhen:member:${slug}`, token);
}

export function clearMyMember(slug: string): void {
  try {
    localStorage.removeItem(`freewhen:memberid:${slug}`);
    localStorage.removeItem(`freewhen:member:${slug}`);
  } catch {
    /* ignore */
  }
}

// ---- per-group view preferences (hours shown + min-free filter) -----------

export type ViewPrefs = {
  dayStart: number; // minutes from midnight
  dayEnd: number;
  minFree: number | null; // null = everyone
};

export function getViewPrefs(slug: string): ViewPrefs | null {
  const raw = safeGet(`freewhen:view:${slug}`);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ViewPrefs>;
    if (
      typeof p.dayStart === "number" &&
      typeof p.dayEnd === "number" &&
      p.dayStart >= 0 &&
      p.dayEnd <= 1440 &&
      p.dayStart < p.dayEnd
    ) {
      return {
        dayStart: p.dayStart,
        dayEnd: p.dayEnd,
        minFree: typeof p.minFree === "number" ? p.minFree : null,
      };
    }
  } catch {
    /* corrupt entry, fall through */
  }
  return null;
}

export function setViewPrefs(slug: string, prefs: ViewPrefs): void {
  safeSet(`freewhen:view:${slug}`, JSON.stringify(prefs));
}
