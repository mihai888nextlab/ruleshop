import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ProfileForm } from "@/components/profile-form";
import { getProfile } from "@/lib/api";
import type { ProfileField } from "@/lib/types";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function ProfilePage() {
  const { authenticated } = useRuleShop();
  const [fields, setFields] = useState<ProfileField[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    void (async () => {
      const result = await getProfile();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFields(result.data.fields);
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md px-5 py-16">
        <h1 className="display text-3xl">Profil</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          <Link to="/login" className="underline">
            Autentifică-te
          </Link>{" "}
          pentru a-ți edita profilul.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-10">
      <h1 className="display text-4xl">Profil</h1>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {fields === null ? (
        <p className="text-sm text-[var(--muted)]">Se încarcă…</p>
      ) : (
        <ProfileForm fields={fields} />
      )}
    </div>
  );
}
