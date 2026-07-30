import { AuthForm } from "@/components/auth-form";

export function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-16">
      <h1 className="display text-3xl">Autentificare</h1>
      <AuthForm mode="login" />
    </div>
  );
}

export function RegisterPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-16">
      <h1 className="display text-3xl">Cont nou</h1>
      <AuthForm mode="register" />
    </div>
  );
}
