"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
        name: fd.get("name"),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Înregistrare eșuată");
      return;
    }
    router.push("/login");
  }

  return (
    <div className="mesh flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4">
        <h1 className="display text-3xl">Cont nou</h1>
        <label className="flex flex-col gap-1 text-sm">
          Nume
          <Input name="name" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <Input name="email" type="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Parolă
          <Input name="password" type="password" minLength={6} required />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={loading}>
          Creează cont
        </Button>
        <p className="text-sm text-[var(--muted)]">
          Ai deja cont?{" "}
          <Link href="/login" className="text-[var(--accent)] underline">
            Autentificare
          </Link>
        </p>
      </form>
    </div>
  );
}
