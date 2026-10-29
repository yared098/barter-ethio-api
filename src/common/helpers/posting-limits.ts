import { BadRequestException } from '@nestjs/common';

export type PostingMode = 'PRO' | 'CREDIT' | 'DAILY' | 'FREE';

export interface PostingStatus {
  mode: PostingMode;
  canPost: boolean;
  reason?: string;

  postsUsedToday: number;
  dailyCap: number;
  postsLeftToday: number;

  budgetLeft: number | null;
  budgetTotal: number | null;

  proExpiresAt: string | null;
  proDaysLeft: number | null;
  dailyPassExpiresAt: string | null;
  creditsRemaining: number;
}

/** Free tier: 1 post per day, resets at UTC midnight. */
export const FREE_DAILY_CAP = 1;

/** Paid tiers (DAILY / CREDIT / PRO): hard 2/day cap. */
export const PAID_DAILY_CAP = 2;

/** Daily pass: 10/day until midnight. */
export const DAILY_PASS_CAP = 10;

export function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function endOfTodayUtc(): Date {
  const d = startOfTodayUtc();
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Pure function — does NOT mutate anything.
 * Reads the user's counters + plan expiry + budgets and returns what the
 * user is allowed to do right now.
 *
 * Priority order (highest → lowest): PRO > DAILY > CREDIT > FREE
 */
export function computePostingStatus(user: {
  tier: string;
  proExpiresAt: Date | null;
  proBudgetRemaining: number | null;
  dailyPassExpiresAt: Date | null;
  creditsRemaining: number | null;
  postsTodayCount: number;
  postsTodayDate: Date | null;
}): PostingStatus {
  const now = new Date();
  const todayStart = startOfTodayUtc();
  const isNewDay = !user.postsTodayDate || user.postsTodayDate < todayStart;
  const usedToday = isNewDay ? 0 : user.postsTodayCount;
  const credits = user.creditsRemaining ?? 0;

  // ── 1. PRO ──
  if (user.proExpiresAt && user.proExpiresAt > now) {
    const budget = user.proBudgetRemaining ?? 0;
    const proDaysLeft = daysBetween(now, user.proExpiresAt);
    const dayLeft = Math.max(0, PAID_DAILY_CAP - usedToday);
    const canPost = budget > 0 && dayLeft > 0;

    let reason: string | undefined;
    if (dayLeft === 0) {
      reason = `Daily limit reached (${PAID_DAILY_CAP}/day). Try again tomorrow.`;
    } else if (budget === 0) {
      reason = 'PRO budget used up. Pay again or buy a credit pack.';
    }

    return {
      mode: 'PRO',
      canPost,
      reason,
      postsUsedToday: usedToday,
      dailyCap: PAID_DAILY_CAP,
      postsLeftToday: dayLeft,
      budgetLeft: budget,
      budgetTotal: null,
      proExpiresAt: user.proExpiresAt.toISOString(),
      proDaysLeft,
      dailyPassExpiresAt: user.dailyPassExpiresAt?.toISOString() ?? null,
      creditsRemaining: credits,
    };
  }

  // ── 2. DAILY PASS ──
  if (user.dailyPassExpiresAt && user.dailyPassExpiresAt > now) {
    const dayLeft = Math.max(0, DAILY_PASS_CAP - usedToday);
    const canPost = dayLeft > 0;
    return {
      mode: 'DAILY',
      canPost,
      reason: canPost
        ? undefined
        : `Daily pass used up (${DAILY_PASS_CAP}/${DAILY_PASS_CAP} today).`,
      postsUsedToday: usedToday,
      dailyCap: DAILY_PASS_CAP,
      postsLeftToday: dayLeft,
      budgetLeft: null,
      budgetTotal: null,
      proExpiresAt: null,
      proDaysLeft: null,
      dailyPassExpiresAt: user.dailyPassExpiresAt.toISOString(),
      creditsRemaining: credits,
    };
  }

  // ── 3. CREDIT PACK ──
  if (credits > 0) {
    const dayLeft = Math.max(0, PAID_DAILY_CAP - usedToday);
    const canPost = dayLeft > 0;
    return {
      mode: 'CREDIT',
      canPost,
      reason: canPost
        ? undefined
        : `Daily limit reached (${PAID_DAILY_CAP}/day). Try again tomorrow.`,
      postsUsedToday: usedToday,
      dailyCap: PAID_DAILY_CAP,
      postsLeftToday: dayLeft,
      budgetLeft: credits,
      budgetTotal: null,
      proExpiresAt: null,
      proDaysLeft: null,
      dailyPassExpiresAt: null,
      creditsRemaining: credits,
    };
  }

  // ── 4. FREE ──
  const dayLeft = Math.max(0, FREE_DAILY_CAP - usedToday);
  const canPost = dayLeft > 0;
  return {
    mode: 'FREE',
    canPost,
    reason: canPost
      ? undefined
      : `Free plan: ${FREE_DAILY_CAP} post/day. ` +
        'Pay 10 birr for a daily pass or 50 birr for 100 posts.',
    postsUsedToday: usedToday,
    dailyCap: FREE_DAILY_CAP,
    postsLeftToday: dayLeft,
    budgetLeft: null,
    budgetTotal: null,
    proExpiresAt: null,
    proDaysLeft: null,
    dailyPassExpiresAt: null,
    creditsRemaining: 0,
  };
}

/**
 * Throws `BadRequestException` with a user-safe message if the user
 * cannot post right now. Returns the computed status otherwise.
 */
export function assertCanPost(user: any): PostingStatus {
  const status = computePostingStatus(user);
  if (!status.canPost) {
    throw new BadRequestException(status.reason);
  }
  return status;
}