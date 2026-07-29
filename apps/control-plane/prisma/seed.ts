import { PrismaClient, type DecisionType, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Action, Condition } from "@ruleshop/engine";

const prisma = new PrismaClient();

async function upsertUser(
  email: string,
  password: string,
  name: string,
  platformRole?: Role | null,
) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, platformRole: platformRole ?? null },
    create: {
      email,
      passwordHash,
      name,
      platformRole: platformRole ?? null,
      loyaltyPoints: email.includes("vip") ? 500 : 50,
    },
  });
}

async function createRuleset(
  storeId: string,
  version: number,
  status: "draft" | "published" | "canary" | "archived",
  rules: {
    key: string;
    name: string;
    description?: string;
    category: DecisionType;
    priority: number;
    conditions: Condition;
    actions: Action[];
  }[],
) {
  return prisma.ruleset.create({
    data: {
      storeId,
      version,
      status,
      name: `v${version}`,
      rules: {
        create: rules.map((r) => ({
          key: r.key,
          name: r.name,
          description: r.description ?? "",
          category: r.category,
          priority: r.priority,
          enabled: true,
          conditions: r.conditions as object,
          actions: r.actions as object[],
        })),
      },
    },
  });
}

async function main() {
  console.log("Seeding RuleShop…");

  await prisma.evaluation.deleteMany();
  await prisma.aiSuggestion.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.ruleset.deleteMany();
  await prisma.deployment.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.customerAttributeDef.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();

  const platform = await upsertUser(
    "admin@ruleshop.local",
    "admin123",
    "Platform Admin",
    "PLATFORM_ADMIN",
  );
  const fashionAdmin = await upsertUser(
    "admin@fashion.local",
    "admin123",
    "Fashion Admin",
  );
  const electronicsAdmin = await upsertUser(
    "admin@electronics.local",
    "admin123",
    "Electronics Admin",
  );
  const vipCustomer = await upsertUser("vip@demo.local", "demo123", "Ana VIP");
  const customer = await upsertUser("client@demo.local", "demo123", "Ion Client");

  const fashion = await prisma.store.create({
    data: {
      slug: "fashion",
      name: "Atelier Nord",
      deployment: { create: { stableVersion: 1, canaryPercent: 0 } },
    },
  });
  const electronics = await prisma.store.create({
    data: {
      slug: "electronics",
      name: "Circuit Hub",
      deployment: { create: { stableVersion: 1, canaryPercent: 0 } },
    },
  });

  const memberships: { storeId: string; userId: string; role: Role }[] = [
    { storeId: fashion.id, userId: fashionAdmin.id, role: "STORE_ADMIN" },
    { storeId: electronics.id, userId: electronicsAdmin.id, role: "STORE_ADMIN" },
    { storeId: fashion.id, userId: vipCustomer.id, role: "CUSTOMER" },
    { storeId: fashion.id, userId: customer.id, role: "CUSTOMER" },
    { storeId: electronics.id, userId: customer.id, role: "CUSTOMER" },
    { storeId: electronics.id, userId: vipCustomer.id, role: "CUSTOMER" },
  ];
  for (const m of memberships) {
    await prisma.membership.create({ data: m });
  }

  await prisma.product.createMany({
    data: [
      {
        storeId: fashion.id,
        slug: "palton-lana",
        name: "Palton din lână",
        description: "Palton elegant pentru sezonul rece.",
        category: "outerwear",
        basePrice: 899,
        stock: 12,
        imageUrl: "/products/coat.svg",
      },
      {
        storeId: fashion.id,
        slug: "rochie-satin",
        name: "Rochie satin",
        description: "Rochie midi din satin.",
        category: "dresses",
        basePrice: 349,
        stock: 25,
        imageUrl: "/products/dress.svg",
      },
      {
        storeId: fashion.id,
        slug: "sneakers-albi",
        name: "Sneakers albi",
        description: "Sneakers minimali din piele.",
        category: "shoes",
        basePrice: 429,
        stock: 40,
        imageUrl: "/products/sneakers.svg",
      },
      {
        storeId: fashion.id,
        slug: "esofa-matase",
        name: "Eșarfă mătase",
        description: "Accesoriu fin din mătase.",
        category: "accessories",
        basePrice: 129,
        stock: 60,
        imageUrl: "/products/scarf.svg",
      },
      {
        storeId: electronics.id,
        slug: "laptop-pro-14",
        name: "Laptop Pro 14",
        description: "Laptop pentru lucru și creativitate.",
        category: "computers",
        basePrice: 5499,
        stock: 8,
        imageUrl: "/products/laptop.svg",
      },
      {
        storeId: electronics.id,
        slug: "casti-noise",
        name: "Căști noise-cancelling",
        description: "Căști wireless cu ANC.",
        category: "audio",
        basePrice: 799,
        stock: 30,
        imageUrl: "/products/headphones.svg",
      },
      {
        storeId: electronics.id,
        slug: "monitor-27",
        name: "Monitor 27\" 4K",
        description: "Monitor IPS 4K.",
        category: "displays",
        basePrice: 1899,
        stock: 15,
        imageUrl: "/products/monitor.svg",
      },
      {
        storeId: electronics.id,
        slug: "ssd-2tb",
        name: "SSD NVMe 2TB",
        description: "Stocare rapidă portabilă.",
        category: "storage",
        basePrice: 649,
        stock: 50,
        imageUrl: "/products/ssd.svg",
      },
      {
        storeId: electronics.id,
        slug: "router-wifi7",
        name: "Router Wi-Fi 7",
        description: "Router de top pentru casă.",
        category: "network",
        basePrice: 999,
        stock: 0,
        imageUrl: "/products/router.svg",
      },
    ],
  });

  await createRuleset(fashion.id, 1, "published", [
    {
      key: "vip-discount",
      name: "Reducere VIP 15%",
      category: "pricing",
      priority: 100,
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
      actions: [{ type: "discountPercent", value: 15 }],
    },
    {
      key: "category-outerwear",
      name: "Outerwear -10%",
      category: "pricing",
      priority: 40,
      conditions: { op: "eq", path: "product.category", value: "outerwear" },
      actions: [{ type: "discountPercent", value: 10 }],
    },
    {
      key: "free-ship-300",
      name: "Livrare gratuită peste 300 RON",
      category: "shipping",
      priority: 80,
      conditions: { op: "gte", path: "cart.subtotal", value: 300 },
      actions: [
        { type: "addShippingOption", method: "standard", cost: 0, label: "Standard (gratuit)" },
        { type: "addShippingOption", method: "express", cost: 25, label: "Express" },
      ],
    },
    {
      key: "default-ship",
      name: "Livrare standard",
      category: "shipping",
      priority: 10,
      conditions: { op: "exists", path: "cart.subtotal" },
      actions: [
        { type: "addShippingOption", method: "standard", cost: 19, label: "Standard" },
        { type: "addShippingOption", method: "express", cost: 39, label: "Express" },
      ],
    },
    {
      key: "loyalty-vip",
      name: "Puncte loialitate VIP",
      category: "loyalty",
      priority: 50,
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
      actions: [{ type: "grantLoyalty", points: 50 }],
    },
    {
      key: "theme-nord",
      name: "Temă Atelier Nord",
      category: "theme",
      priority: 10,
      conditions: { op: "exists", path: "store.slug" },
      actions: [{ type: "setTheme", themeId: "nord" }],
    },
    {
      key: "stock-gate",
      name: "Indisponibil fără stoc",
      category: "availability",
      priority: 100,
      conditions: { op: "lte", path: "product.stock", value: 0 },
      actions: [
        {
          type: "setAvailability",
          available: false,
          reason: "Stoc epuizat",
        },
      ],
    },
    {
      key: "fraud-guest-high",
      name: "Fraudă guest sumă mare",
      category: "fraud",
      priority: 90,
      conditions: {
        op: "and",
        children: [
          { op: "eq", path: "customer.isGuest", value: true },
          { op: "gt", path: "order.total", value: 1500 },
        ],
      },
      actions: [
        { type: "flagFraud", score: 80, reason: "Guest cu sumă mare" },
        { type: "blockCheckout", reason: "Comandă blocată pentru verificare antifraudă" },
      ],
    },
  ]);

  await createRuleset(electronics.id, 1, "published", [
    {
      key: "bundle-audio",
      name: "Audio -12%",
      category: "pricing",
      priority: 60,
      conditions: { op: "eq", path: "product.category", value: "audio" },
      actions: [{ type: "discountPercent", value: 12 }],
    },
    {
      key: "free-ship-1000",
      name: "Livrare gratuită peste 1000 RON",
      category: "shipping",
      priority: 80,
      conditions: { op: "gte", path: "cart.subtotal", value: 1000 },
      actions: [
        { type: "addShippingOption", method: "standard", cost: 0, label: "Standard (gratuit)" },
        { type: "addShippingOption", method: "express", cost: 49, label: "Express" },
      ],
    },
    {
      key: "default-ship-e",
      name: "Livrare standard electronics",
      category: "shipping",
      priority: 10,
      conditions: { op: "exists", path: "cart.subtotal" },
      actions: [
        { type: "addShippingOption", method: "standard", cost: 29, label: "Standard" },
        { type: "addShippingOption", method: "express", cost: 59, label: "Express" },
      ],
    },
    {
      key: "strict-fraud",
      name: "Antifraudă strictă",
      category: "fraud",
      priority: 100,
      conditions: {
        op: "or",
        children: [
          { op: "gt", path: "order.total", value: 4000 },
          {
            op: "and",
            children: [
              { op: "eq", path: "customer.isGuest", value: true },
              { op: "gt", path: "order.total", value: 800 },
            ],
          },
        ],
      },
      actions: [
        { type: "flagFraud", score: 90, reason: "Risc ridicat" },
        { type: "blockCheckout", reason: "Tranzacție suspectă — contactează suportul" },
      ],
    },
    {
      key: "loyalty-purchase",
      name: "Puncte la cumpărare",
      category: "loyalty",
      priority: 20,
      conditions: { op: "gte", path: "cart.subtotal", value: 100 },
      actions: [{ type: "grantLoyalty", points: 20 }],
    },
    {
      key: "theme-circuit",
      name: "Temă Circuit Hub",
      category: "theme",
      priority: 10,
      conditions: { op: "exists", path: "store.slug" },
      actions: [{ type: "setTheme", themeId: "circuit" }],
    },
    {
      key: "oos",
      name: "Fără stoc",
      category: "availability",
      priority: 100,
      conditions: { op: "lte", path: "product.stock", value: 0 },
      actions: [
        { type: "setAvailability", available: false, reason: "Indisponibil momentan" },
      ],
    },
  ]);

  /**
   * Administrator-defined customer attributes.
   *
   * The two stores deliberately define different fields. Each store's rules can
   * only reference its own, which is what tenant isolation means for the schema:
   * Atelier Nord has no notion of a warranty plan, and Circuit Hub has no notion
   * of a preferred city.
   */
  await prisma.customerAttributeDef.createMany({
    data: [
      {
        storeId: fashion.id,
        key: "city",
        label: "Oraș",
        description: "Orașul de livrare preferat",
        type: "enum",
        options: ["Cluj", "Iași", "Timișoara", "București"],
        showOnProfile: true,
        position: 0,
      },
      {
        storeId: fashion.id,
        key: "birthday",
        label: "Zi de naștere",
        description: "Folosită pentru campanii aniversare",
        type: "date",
        showOnProfile: true,
        position: 1,
      },
      {
        storeId: fashion.id,
        key: "newsletter",
        label: "Abonat la newsletter",
        type: "boolean",
        showOnProfile: true,
        position: 2,
      },
      {
        storeId: electronics.id,
        key: "warranty_plan",
        label: "Plan de garanție",
        description: "Nivelul de garanție ales de client",
        type: "enum",
        options: ["basic", "extended", "pro"],
        showOnProfile: true,
        position: 0,
      },
      {
        storeId: electronics.id,
        key: "business_account",
        label: "Cont de firmă",
        type: "boolean",
        showOnProfile: true,
        position: 1,
      },
    ],
  });

  // Profile values, per store, for the same shared account.
  await prisma.customerProfile.createMany({
    data: [
      {
        storeId: fashion.id,
        userId: vipCustomer.id,
        values: { city: "Cluj", birthday: "1994-03-15", newsletter: true },
      },
      {
        storeId: electronics.id,
        userId: vipCustomer.id,
        values: { warranty_plan: "pro", business_account: false },
      },
      {
        storeId: fashion.id,
        userId: customer.id,
        values: { city: "București", newsletter: false },
      },
    ],
  });

  // Draft v2 for fashion (for versioning/diff demos, and to open in the editor)
  await createRuleset(fashion.id, 2, "draft", [
    {
      key: "vip-discount",
      name: "Reducere VIP 20%",
      description: "Creștere campanie VIP",
      category: "pricing",
      priority: 100,
      conditions: { op: "eq", path: "customer.tier", value: "vip" },
      actions: [{ type: "discountPercent", value: 20 }],
    },
    {
      key: "weekend-shoes",
      name: "Shoes weekend -5%",
      category: "pricing",
      priority: 30,
      conditions: { op: "eq", path: "product.category", value: "shoes" },
      actions: [{ type: "discountPercent", value: 5 }],
    },
    {
      // Exercises a store-defined attribute, a nested group and a negation, so
      // the visual editor has something structural to open with.
      key: "cluj-loyal-local",
      name: "Client fidel din Cluj",
      description:
        "Reducere pentru clienți din Cluj abonați la newsletter, exceptând prima comandă",
      category: "pricing",
      priority: 200,
      conditions: {
        op: "and",
        children: [
          { op: "eq", path: "customer.attributes.city", value: "Cluj" },
          { op: "eq", path: "customer.attributes.newsletter", value: true },
          { op: "not", child: { op: "eq", path: "customer.isFirstOrder", value: true } },
        ],
      },
      actions: [{ type: "discountPercent", value: 25 }],
    },
  ]);

  await prisma.auditLog.create({
    data: {
      storeId: fashion.id,
      userId: platform.id,
      action: "seed.completed",
      entity: "Store",
      entityId: fashion.id,
      meta: { message: "Date demonstrative create" },
    },
  });

  console.log("Done.");
  console.log("Accounts:");
  console.log("  admin@ruleshop.local / admin123 (platform)");
  console.log("  admin@fashion.local / admin123");
  console.log("  admin@electronics.local / admin123");
  console.log("  vip@demo.local / demo123");
  console.log("  client@demo.local / demo123");
  console.log("Stores: /s/fashion  /s/electronics");
  console.log(
    "Customer schema: /s/fashion/attributes (city, birthday, newsletter)",
  );
  console.log("Visual rule editor: /s/fashion/rules/2 (draft)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
