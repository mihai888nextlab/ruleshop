const TOKEN_KEY = "rs_token";
const GUEST_KEY = "rs_guest";

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(GUEST_KEY);
    if (existing && /^g_[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const id = `g_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    localStorage.setItem(GUEST_KEY, id);
    return id;
  } catch {
    return "g_anonymous";
  }
}

export function clearSession() {
  setSessionToken(null);
}
