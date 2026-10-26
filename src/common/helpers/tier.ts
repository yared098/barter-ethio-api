import { PrismaService } from '../../prisma/prisma.service';

export type EffectiveTier = 'FREE' | 'PRO';

export async function getEffectiveTier(
  prisma: PrismaService,
  userId: string,
): Promise<EffectiveTier> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, proExpiresAt: true },
  });

  if (!user) return 'FREE';
  if (user.tier !== 'PRO') return 'FREE';
  if (user.proExpiresAt && user.proExpiresAt < new Date()) return 'FREE';
  return 'PRO';
}

export const TIER_LIMITS = {
  FREE: {
    maxActiveProducts: 1,
    matchVisibleCount: 10,
  },
  PRO: {
    maxActiveProducts: Number.POSITIVE_INFINITY,
    matchVisibleCount: Number.POSITIVE_INFINITY,
  },
} as const;

export function tierLimits(tier: EffectiveTier) {
  return TIER_LIMITS[tier];
}
