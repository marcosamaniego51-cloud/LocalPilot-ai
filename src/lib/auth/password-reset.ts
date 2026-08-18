/**
 * Password set/reset token verification (Task 7.3, supporting the claim
 * flow's "set your password" email). Reused for any future
 * forgot-password flow — nothing here is claim-flow-specific.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function setPasswordFromToken(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tokenHash = hashToken(rawToken);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!resetToken) {
    return { ok: false, error: "Invalid or expired link" };
  }
  if (resetToken.usedAt) {
    return { ok: false, error: "This link has already been used" };
  }
  if (resetToken.expiresAt < new Date()) {
    return { ok: false, error: "This link has expired" };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.tenantUser.update({
      where: { id: resetToken.tenantUserId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true };
}
