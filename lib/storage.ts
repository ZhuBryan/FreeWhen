// lib/storage.ts — tiny localStorage helpers (client only). No tokens ever leave
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
    /* storage blocked — non-fatal */
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
