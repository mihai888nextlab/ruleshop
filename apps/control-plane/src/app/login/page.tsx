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
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4">
      <h1 className="display text-3xl">Autentificare</h1>
      <p className="text-sm text-[var(--muted)]">
        Demo: vip@demo.local / demo123 · admin@fashion.local / admin123
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <Input name="email" type="email" required defaultValue="vip@demo.local" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Parolă
        <Input name="password" type="password" required defaultValue="demo123" />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Se conectează…" : "Intră"}
      </Button>
      <p className="text-sm text-[var(--muted)]">
        Nu ai cont?{" "}
        <Link href="/register" className="text-[var(--accent)] underline">
          Înregistrare
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mesh flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
