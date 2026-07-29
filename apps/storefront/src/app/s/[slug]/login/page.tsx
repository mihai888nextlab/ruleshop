import Link from "next/link";
import { signIn } from "@/app/actions";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="display text-4xl">Intră în cont</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Coșul adăugat ca oaspete este păstrat după autentificare.
        </p>
      </div>

      <AuthForm action={signIn.bind(null, slug)} mode="login" />

      <p className="text-sm text-[var(--muted)]">
        Nu ai cont?{" "}
        <Link href={`/s/${slug}/register`} className="underline">
          Creează unul
        </Link>
      </p>
    </div>
  );
}
