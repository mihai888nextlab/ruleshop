import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { runDecision } from "@/lib/decide";
import { getOrCreateGuestId } from "@/lib/store";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  storeId: z.string().min(1),
  storeSlug: z.string().optional(),
  decisionType: z.enum([
    "pricing",
    "shipping",
    "fraud",
    "availability",
    "loyalty",
    "theme",
  ]),
  context: z.record(z.string(), z.unknown()).default({}),
  subjectKey: z.string().optional(),
  persist: z.boolean().optional(),
  rulesetVersion: z.number().int().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Cerere invalidă", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let storeId = parsed.data.storeId;
    if (parsed.data.storeSlug) {
      const store = await prisma.store.findUnique({
        where: { slug: parsed.data.storeSlug },
      });
      if (!store || store.id !== storeId) {
        return NextResponse.json({ error: "Magazin invalid" }, { status: 404 });
      }
    } else {
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) {
        return NextResponse.json({ error: "Magazin inexistent" }, { status: 404 });
      }
    }

    const session = await auth();
    const guestId = await getOrCreateGuestId();
    const subjectKey =
      parsed.data.subjectKey ??
      (session?.user?.id ? `user:${session.user.id}` : `guest:${guestId}`);

    const result = await runDecision({
      storeId,
      decisionType: parsed.data.decisionType,
      context: parsed.data.context,
      subjectKey,
      persist: parsed.data.persist,
      rulesetVersion: parsed.data.rulesetVersion,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Eroare internă" },
      { status: 500 },
    );
  }
}
