import { redirect } from "next/navigation";
import { saveProfile } from "@/app/actions";
import { ProfileForm } from "@/components/profile-form";
import { getProfile } from "@/lib/api";

/**
 * Customer profile.
 *
 * The fields are whatever this store's administrator defined. Values entered
 * here feed the decision context, so saving the form can change the prices this
 * customer sees on the next page load — which is the point of letting an
 * administrator define the schema in the first place.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getProfile(slug);

  if (!result.ok) {
    if (result.status === 401) redirect(`/s/${slug}/login`);
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-8">
        <h1 className="display text-2xl">Profilul nu poate fi afișat</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="display text-4xl">Profil</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Aceste câmpuri sunt definite de administratorul magazinului și sunt
          folosite de regulile care decid prețuri, livrare și beneficii. Sunt
          valabile doar în acest magazin.
        </p>
      </div>

      <ProfileForm
        action={saveProfile.bind(null, slug)}
        fields={result.data.fields}
      />
    </div>
  );
}
