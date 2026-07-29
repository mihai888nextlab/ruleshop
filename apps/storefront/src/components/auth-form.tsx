"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";

/**
 * Sign-in and registration.
 *
 * Both call the control plane, which is the only side that ever sees a password
 * or a hash. The token it returns is stored in an httpOnly cookie by the server
 * action, so it never reaches client JavaScript.
 */
export function AuthForm({
  action,
  mode,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  mode: "login" | "register";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const isRegister = mode === "register";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isRegister && (
        <label className="flex flex-col gap-1 text-sm">
          Nume
          <input
            name="name"
            autoComplete="name"
            className="border-b border-[var(--border)] bg-transparent py-1.5 outline-none focus:border-[var(--accent)]"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="border-b border-[var(--border)] bg-transparent py-1.5 outline-none focus:border-[var(--accent)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Parolă
        <input
          name="password"
          type="password"
          required
          minLength={isRegister ? 8 : undefined}
          autoComplete={isRegister ? "new-password" : "current-password"}
          className="border-b border-[var(--border)] bg-transparent py-1.5 outline-none focus:border-[var(--accent)]"
        />
        {isRegister && (
          <span className="text-xs text-[var(--muted)]">
            Minim 8 caractere.
          </span>
        )}
      </label>

      {state?.error && (
        <p
          role="alert"
          className="border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending
          ? "Se procesează…"
          : isRegister
            ? "Creează cont"
            : "Autentifică-te"}
      </button>
    </form>
  );
}
