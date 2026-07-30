"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Email sau parolă invalidă");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        Autentificare
      </h1>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Demo: vip@demo.local / demo123 · admin@fashion.local / admin123
      </p>
      <label className="mt-5 flex flex-col gap-1 text-sm">
        Email
        <Input name="email" type="email" required defaultValue="vip@demo.local" />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        Parolă
        <Input
          name="password"
          type="password"
          required
          defaultValue="demo123"
        />
      </label>
      {error && (
        <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
      )}
      <Button type="submit" disabled={loading} className="mt-5 w-full">
        {loading ? "Se conectează…" : "Intră"}
      </Button>
      <p className="mt-4 text-sm text-[var(--muted)]">
        Vrei un magazin?{" "}
        <Link href="/register" className="underline">
          Deschide un magazin
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
