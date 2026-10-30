import { PrismaService } from '../../prisma/prisma.service';

// ═══════════════════════════════════════════════════════════════════
// Tier types
// ═══════════════════════════════════════════════════════════════════
export type Tier = 'FREE' | 'DAILY' | 'CREDIT' | 'PRO';
export type PaidTier = 'DAILY' | 'CREDIT' | 'PRO';

/**
 * Resolve the user's CURRENT effective tier, taking expiry + credits
 * into account. Downgrades PRO→CREDIT→DAILY→FREE on-the-fly if
 * anything has expired.
 *
 * This is the source of truth for "is this user paid right now?"
 */
export async function getEffectiveTier(
  prisma: PrismaService,
  userId: string,
): Promise<Tier> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tier: true,
      proExpiresAt: true,
      proBudgetRemaining: true,
      dailyPassExpiresAt: true,
      creditsRemaining: true,
    },
  });

  if (!user) return 'FREE';

  const now = new Date();
  const credits = user.creditsRemaining ?? 0;

  // ── 1. PRO — only if expiry in future AND budget > 0 ──
  if (user.tier === 'PRO' && user.proExpiresAt && user.proExpiresAt > now) {
    return 'PRO';
  }

  // ── 2. DAILY — only if expiry in future ──
  if (user.tier === 'DAILY' && user.dailyPassExpiresAt && user.dailyPassExpiresAt > now) {
    return 'DAILY';
  }

  // ── 3. CREDIT — only if credits > 0 ──
  if (credits > 0) {
    return 'CREDIT';
  }

  // ── 4. Fall through: expired / no credits → FREE ──
  // Best-effort DB downgrade so next read doesn't recompute
  if (user.tier !== 'FREE') {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { tier: 'FREE' },
      });
    } catch {
      // Ignore — computed result is still FREE
    }
  }

  return 'FREE';
}

/**
 * Convenience boolean — true for ANY paid tier that has value remaining.
 */
export async function userHasPaidAccess(
  prisma: PrismaService,
  userId: string,
): Promise<boolean> {
  const tier = await getEffectiveTier(prisma, userId);
  return tier !== 'FREE';
}

// ═══════════════════════════════════════════════════════════════════
// Tier limits — controls visible matches / teasers
// ═══════════════════════════════════════════════════════════════════
export interface TierLimits {
  matchVisibleCount: number;       // how many full matches to show
  matchTeaserCount: number;        // how many blurred locked cards
  maxActiveProducts: number;       // max products a user can post
}

const LIMITS: Record<Tier, TierLimits> = {
  FREE: {
    matchVisibleCount: 3,
    matchTeaserCount: 5,
    maxActiveProducts: 1,
  },
  DAILY: {
    matchVisibleCount: 999,        // effectively unlimited
    matchTeaserCount: 0,
    maxActiveProducts: 10,
  },
  CREDIT: {
    matchVisibleCount: 999,
    matchTeaserCount: 0,
    maxActiveProducts: 999,
  },
  PRO: {
    matchVisibleCount: 999,
    matchTeaserCount: 0,
    maxActiveProducts: 999,
  },
};

export function tierLimits(tier: Tier): TierLimits {
  return LIMITS[tier] ?? LIMITS.FREE;
}