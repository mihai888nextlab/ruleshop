import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, register } from "@/lib/api";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const { retry } = useRuleShop();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = form.get("name") ? String(form.get("name")) : undefined;

    const result = isRegister
      ? await register({ email, password, name })
      : await login(email, password);

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    retry();
    navigate("/");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {isRegister && (
        <label className="flex flex-col gap-1 text-sm">
          Nume
          <input name="name" autoComplete="name" className="field" />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field"
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
          className="field"
        />
        {isRegister && (
          <span className="text-xs text-[var(--muted)]">
            Minim 8 caractere.
          </span>
        )}
      </label>

      {error && (
        <p
          role="alert"
          className="border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn disabled:opacity-60">
        {pending
          ? "Se procesează…"
          : isRegister
            ? "Creează cont"
            : "Autentifică-te"}
      </button>

      <p className="text-sm text-[var(--muted)]">
        {isRegister ? (
          <>
            Ai deja cont?{" "}
            <Link to="/login" className="underline">
              Autentifică-te
            </Link>
          </>
        ) : (
          <>
            Cont nou?{" "}
            <Link to="/register" className="underline">
              Înregistrează-te
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
