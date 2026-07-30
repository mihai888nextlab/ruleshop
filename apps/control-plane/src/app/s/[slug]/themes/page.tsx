import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Action } from "@ruleshop/engine";
import {
  createTheme,
  deleteTheme,
  duplicateTheme,
  setDefaultTheme,
  updateTheme,
  uploadThemeHeroImage,
} from "@/app/actions/themes";
import {
  ThemeManager,
  type ThemeRow,
} from "@/components/themes/theme-manager";
import { Button } from "@/components/ui/button";
import { requireStoreRole } from "@/lib/auth";
import { getTranslator } from "@/i18n/server";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import { listThemes, parseTokens } from "@/lib/theme-service";

/**
 * Theme library.
 *
 * The design half of the `theme` decision point: rules pick a key, this page
 * decides what that key looks like. Each theme is shown with the rules that
 * select it, so it is obvious which ones customers are actually seeing.
 */
export default async function ThemesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/themes`);

  const t = await getTranslator();

  const liveVersion = store.deployment?.stableVersion ?? null;

  const [themes, themeRules] = await Promise.all([
    listThemes(store.id),
    prisma.ruleset.findMany({
      where: { storeId: store.id, status: { not: "archived" } },
      select: {
        version: true,
        rules: {
          where: { category: "theme" },
          select: { key: true, actions: true },
        },
      },
    }),
  ]);

  /** Which rules select each theme key, and whether that ruleset is live. */
  const usageByKey = new Map<
    string,
    { ruleKey: string; rulesetVersion: number; live: boolean }[]
  >();

  for (const ruleset of themeRules) {
    for (const rule of ruleset.rules) {
      for (const action of (rule.actions ?? []) as Action[]) {
        if (action.type !== "setTheme") continue;
        const bucket = usageByKey.get(action.themeId) ?? [];
        bucket.push({
          ruleKey: rule.key,
          rulesetVersion: ruleset.version,
          live: ruleset.version === liveVersion,
        });
        usageByKey.set(action.themeId, bucket);
      }
    }
  }

  const rows: ThemeRow[] = themes.map((theme) => ({
    id: theme.id,
    key: theme.key,
    name: theme.name,
    tokens: parseTokens(theme.tokens),
    isDefault: theme.isDefault,
    usedBy: usageByKey.get(theme.key) ?? [],
  }));

  /** Keys a rule points at that no theme provides. */
  const orphanKeys = [...usageByKey.keys()].filter(
    (key) => !themes.some((theme) => theme.key === key),
  );

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link
          href={`/s/${slug}/rules`}
          className="text-sm text-[var(--muted)] hover:underline"
        >
          {t("common.backControlPlane")}
        </Link>
        <h1 className="font-semibold tracking-tight mt-1 text-3xl">
          {t("themes.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">{t("themes.intro")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/s/${slug}/rules`}>
            <Button variant="outline" size="sm">
              {t("themes.rulesLink")}
            </Button>
          </Link>
          <Link href={`/s/${slug}/attributes`}>
            <Button variant="outline" size="sm">
              {t("themes.schemaLink")}
            </Button>
          </Link>
        </div>
      </header>

      {orphanKeys.length > 0 && (
        <p className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("themes.orphanWarningDetail", { keys: orphanKeys.join(", ") })}
        </p>
      )}

      <ThemeManager
        themes={rows}
        actions={{
          create: createTheme.bind(null, slug),
          update: updateTheme.bind(null, slug) as (
            id: string,
            input: { name: string; tokens: ThemeRow["tokens"] },
          ) => Promise<unknown>,
          setDefault: setDefaultTheme.bind(null, slug),
          duplicate: duplicateTheme.bind(null, slug),
          remove: deleteTheme.bind(null, slug),
          uploadHero: uploadThemeHeroImage.bind(null, slug),
        }}
      />
    </div>
  );
}
