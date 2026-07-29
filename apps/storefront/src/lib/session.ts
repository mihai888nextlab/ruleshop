import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./api";

/**
 * Customer session storage.
 *
 * The bearer token issued by the control plane is kept in an httpOnly cookie and
 * only ever read on the server. It is never sent to the browser, so a script on
 * the page cannot exfiltrate it, and the storefront attaches it to API calls on
 * the customer's behalf.
 */

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export async function setSessionToken(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionToken(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function hasSession(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(SESSION_COOKIE)?.value);
}
