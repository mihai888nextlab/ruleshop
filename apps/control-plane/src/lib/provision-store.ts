import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { DEFAULT_THEME_TOKENS } from "@ruleshop/contracts";
import { prisma } from "./prisma";
import { issueStoreApiKey } from "./store-api-key";
import { buildCloneCommand } from "./storefront-clone";

const BCRYPT_ROUNDS = 12;

export type ProvisionStoreInput = {
  name: string;
  slug: string;
  admin: {
    email: string;
    password: string;
    name: string;
  };
};

export type ProvisionStoreResult = {
  store: { id: string; slug: string; name: string };
  admin: { id: string; email: string; name: string | null };
  apiKey: string;
  cloneCommand: string;
  /** True when the admin user already existed and was attached to the store. */
  adminReused: boolean;
};

/**
 * Blank store template used for every new shop:
 * default theme, published empty ruleset v1, deployment, unique API key,
 * and a STORE_ADMIN membership for the given account.
 */
export async function provisionStore(
  input: ProvisionStoreInput,
): Promise<
  | { ok: true; data: ProvisionStoreResult }
  | { ok: false; error: string; status: number }
> {
  const email = input.admin.email.trim().toLowerCase();
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();

  const existingStore = await prisma.store.findUnique({ where: { slug } });
  if (existingStore) {
    return { ok: false, error: "Există deja un magazin cu acest slug", status: 409 };
  }

  let adminReused = false;
  let admin = await prisma.user.findUnique({ where: { email } });

  if (admin) {
    const matches = await bcrypt.compare(input.admin.password, admin.passwordHash);
    if (!matches) {
      return {
        ok: false,
        error:
          "Există deja un cont cu acest email. Folosește parola corectă pentru a-i atașa magazinul, sau alege alt email.",
        status: 409,
      };
    }
    adminReused = true;
    if (input.admin.name.trim() && !admin.name) {
      admin = await prisma.user.update({
        where: { id: admin.id },
        data: { name: input.admin.name.trim() },
      });
    }
  } else {
    const passwordHash = await bcrypt.hash(input.admin.password, BCRYPT_ROUNDS);
    admin = await prisma.user.create({
      data: {
        email,
        name: input.admin.name.trim() || null,
        passwordHash,
      },
    });
  }

  const tokens = DEFAULT_THEME_TOKENS as unknown as Prisma.InputJsonValue;

  const store = await prisma.store.create({
    data: {
      name,
      slug,
      deployment: { create: { stableVersion: null, canaryPercent: 0 } },
      themes: {
        create: {
          key: "default",
          name: "Implicit",
          isDefault: true,
          tokens,
        },
      },
      rulesets: {
        create: {
          version: 1,
          status: "published",
          name: "v1",
        },
      },
      memberships: {
        create: {
          userId: admin.id,
          role: "STORE_ADMIN",
        },
      },
      attributeDefs: {
        create: [
          {
            key: "city",
            label: "Oraș",
            description: "Orașul clientului",
            type: "string",
            required: false,
            showOnProfile: true,
            position: 0,
          },
          {
            key: "newsletter",
            label: "Newsletter",
            description: "Abonat la newsletter",
            type: "boolean",
            required: false,
            showOnProfile: true,
            position: 1,
          },
        ],
      },
    },
  });

  await prisma.deployment.update({
    where: { storeId: store.id },
    data: { stableVersion: 1 },
  });

  const key = await issueStoreApiKey(store.id, "default");

  await prisma.auditLog.create({
    data: {
      storeId: store.id,
      userId: admin.id,
      action: "store.provisioned",
      entity: "Store",
      entityId: store.id,
      meta: {
        slug: store.slug,
        adminEmail: admin.email,
        adminReused,
      },
    },
  });

  return {
    ok: true,
    data: {
      store: { id: store.id, slug: store.slug, name: store.name },
      admin: { id: admin.id, email: admin.email, name: admin.name },
      apiKey: key.plaintext,
      cloneCommand: buildCloneCommand(key.plaintext),
      adminReused,
    },
  };
}
