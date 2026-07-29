import Link from "next/link";
import { signUp } from "@/app/actions";
import { AuthForm } from "@/components/auth-form";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="display text-4xl">Cont nou</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Contul este creat pentru acest magazin. Datele de profil pe care le
          completezi aici nu sunt vizibile în alte magazine ale platformei.
        </p>
      </div>

      <AuthForm action={signUp.bind(null, slug)} mode="register" />

      <p className="text-sm text-[var(--muted)]">
        Ai deja cont?{" "}
        <Link href={`/s/${slug}/login`} className="underline">
          Autentifică-te
        </Link>
      </p>
    </div>
  );
}
