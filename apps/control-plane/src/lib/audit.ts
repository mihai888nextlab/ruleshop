import { prisma } from "./prisma";

export async function writeAudit(input: {
  storeId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      storeId: input.storeId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      meta: input.meta as object | undefined,
    },
  });
}
