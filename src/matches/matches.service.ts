import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../analysis/ai.service';
import { getEffectiveTier, tierLimits } from '../common/helpers/tier';
import { NotificationsService } from 'src/notifications/notifications.service';
import { RedisService } from 'src/redis/redis.service';

export interface MatchResult {
  product: any;
  score: number;
  reasons: string[];
  wantsMatch: { categoryId: string; keywords?: string | null };
  aiRanked?: boolean;
}

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,


  ) {}

  async getMatchesForUser(userId: string) {
    const myProducts = await this.prisma.product.findMany({
      where: { ownerId: userId, status: 'AVAILABLE' },
      include: {
        category: true,
        wants: { include: { category: true } },
      },
    });

    if (!myProducts.length) {
      return this.formatResponse([], 'FREE', 0);
    }

    // Build sets
    const wantedCategoryIds = new Set<string>();
    const myCategoryIds = new Set<string>();
    const myMaxValue = Math.max(...myProducts.map((p) => p.estimatedValue));
    for (const p of myProducts) {
      myCategoryIds.add(p.categoryId);
      for (const w of p.wants) wantedCategoryIds.add(w.categoryId);
    }

    // ── Stage 1: Rule-based filtering ──
    const candidates = await this.prisma.product.findMany({
      where: {
        ownerId: { not: userId },
        status: 'AVAILABLE',
        categoryId: { in: [...wantedCategoryIds] },
      },
      include: {
        category: true,
        owner: { select: { id: true, name: true, image: true } },
        wants: true,
      },
      take: 500,
    });

    const scored: MatchResult[] = [];

    for (const candidate of candidates) {
      for (const myProduct of myProducts) {
        const matchingWant = myProduct.wants.find(
          (w) => w.categoryId === candidate.categoryId,
        );
        if (!matchingWant) continue;

        const reasons: string[] = [];
        let score = 40;
        reasons.push(`Matches your "${matchingWant.category.name}" want`);

        const bidirectional = candidate.wants.some((w) =>
          myCategoryIds.has(w.categoryId),
        );
        if (bidirectional) {
          score += 40;
          reasons.push('They also want what you have');
        }

        const diffRatio =
          Math.abs(candidate.estimatedValue - myMaxValue) / myMaxValue;
        const valueScore = Math.max(0, 20 * (1 - diffRatio));
        score += valueScore;
        if (valueScore > 12) reasons.push('Similar estimated value');

        if (matchingWant.keywords) {
          const kw = matchingWant.keywords.toLowerCase();
          if (candidate.title.toLowerCase().includes(kw)) {
            score += 15;
            reasons.push(`Title matches "${matchingWant.keywords}"`);
          }
        }

        scored.push({
          product: {
            id: candidate.id,
            title: candidate.title,
            images: candidate.images,
            estimatedValue: candidate.estimatedValue,
            condition: candidate.condition,
            category: candidate.category,
            owner: candidate.owner,
          },
          score: Math.round(score),
          reasons,
          wantsMatch: {
            categoryId: matchingWant.categoryId,
            keywords: matchingWant.keywords,
          },
          aiRanked: false,
        });

        break;
      }
    }

    // Dedupe
    const seen = new Set<string>();
    const unique = scored
      .sort((a, b) => b.score - a.score)
      .filter((m) => {
        if (seen.has(m.product.id)) return false;
        seen.add(m.product.id);
        return true;
      });

    // ── Stage 2: AI re-rank top 15 ──
    if (this.ai.isReady && unique.length > 0) {
      const TOP_N = 15;
      const top = unique.slice(0, TOP_N);
      const rest = unique.slice(TOP_N);

      const wantsList = myProducts.flatMap((p) =>
        p.wants.map((w) => ({
          categoryName: w.category.name,
          keywords: w.keywords,
        })),
      );

      const productsList = myProducts.map((p) => ({
        title: p.title,
        categoryName: p.category.name,
        value: p.estimatedValue,
      }));

      const candidatesForAi = top.map((m) => ({
        id: m.product.id,
        title: m.product.title,
        category: m.product.category.name,
        value: m.product.estimatedValue,
        condition: m.product.condition as string,
      }));

      const aiScores = await this.ai.rerankMatches(
        productsList,
        wantsList,
        candidatesForAi,
      );

      if (aiScores.length > 0) {
        const aiMap = new Map(aiScores.map((s) => [s.id, s]));

        const aiRanked = top.map((m) => {
          const aiResult = aiMap.get(m.product.id);
          if (!aiResult) return m;

          return {
            ...m,
            score: aiResult.score,
            reasons: [
              aiResult.reason,
              ...m.reasons,
            ].filter(Boolean),
            aiRanked: true,
          };
        });

        // AI-ranked first, then remaining rule-based
        unique.length = 0;
        unique.push(
          ...aiRanked.sort((a, b) => b.score - a.score),
          ...rest,
        );

        this.logger.log(
          `[MATCH-AI] user=${userId} total=${unique.length} ai-scored=${aiRanked.length}`,
        );
      }
    }

    const tier = await getEffectiveTier(this.prisma, userId);
    return this.formatResponse(unique, tier, unique.length);
  }
    // ═══════════════════════════════════════════════
  //  AI MATCH DELIVERY — notify users about new matches
  // ═══════════════════════════════════════════════

  /**
   * Called after a new product is created.
   * Finds users whose "wants" match the new product's category,
   * AI-scores each, and sends push notifications for high-confidence matches.
   */
  async notifyUsersAboutNewProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, owner: { select: { name: true } } },
    });

    if (!product || product.status !== 'AVAILABLE') return;

    // Find users who want this category (via ProductWanted)
    const interestedProducts = await this.prisma.productWanted.findMany({
      where: {
        categoryId: product.categoryId,
        product: {
          ownerId: { not: product.ownerId },
          status: 'AVAILABLE',
        },
      },
      include: {
        product: {
          include: {
            owner: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Group by user, keep their products that want this category
    const usersWithWants = new Map<
      string,
      {
        products: Array<{
          id: string;
          title: string;
          categoryName: string;
          value: number;
        }>;
        wants: Array<{ categoryName: string; keywords?: string | null }>;
      }
    >();

    for (const pw of interestedProducts) {
      const userId = pw.product.ownerId;
      if (userId === product.ownerId) continue;

      if (!usersWithWants.has(userId)) {
        // Load all of this user's active products + wants (for AI context)
        const userProducts = await this.prisma.product.findMany({
          where: { ownerId: userId, status: 'AVAILABLE' },
          include: {
            category: true,
            wants: { include: { category: true } },
          },
        });

        usersWithWants.set(userId, {
          products: userProducts.map((p) => ({
            id: p.id,
            title: p.title,
            categoryName: p.category.name,
            value: p.estimatedValue,
          })),
          wants: userProducts.flatMap((p) =>
            p.wants.map((w) => ({
              categoryName: w.category.name,
              keywords: w.keywords,
            })),
          ),
        });
      }
    }

    if (usersWithWants.size === 0) return;

    this.logger.log(
      `[MATCH-NOTIFY] new product="${product.title}" interested users=${usersWithWants.size}`,
    );

    // Cap AI calls to avoid cost spikes — top 10 users per new product
    const MAX_AI_CALLS = 10;
    const entries = [...usersWithWants.entries()].slice(0, MAX_AI_CALLS);

    for (const [userId, context] of entries) {
      try {
        // Throttle: 1 match notification per user per category per 12 hours
        const throttleKey = `match-notify:${userId}:${product.categoryId}`;
        const alreadyNotified = await this.redis.get(throttleKey);
        if (alreadyNotified) {
          this.logger.debug(
            `[MATCH-NOTIFY] skip user=${userId} — throttled`,
          );
          continue;
        }

        // AI scores this ONE candidate for this user
        let shouldNotify = false;
        let score = 0;
        let reason = '';

        if (this.ai.isReady) {
          const aiScores = await this.ai.rerankMatches(
            context.products,
            context.wants,
            [
              {
                id: product.id,
                title: product.title,
                category: product.category.name,
                value: product.estimatedValue,
                condition: product.condition as string,
              },
            ],
          );

          if (aiScores.length > 0) {
            score = aiScores[0].score;
            reason = aiScores[0].reason;
            shouldNotify = score >= 75;
          }
        } else {
          // Fallback: rule-based threshold (category match = notify)
          score = 80;
          reason = `matches your "${product.category.name}" want`;
          shouldNotify = true;
        }

        if (!shouldNotify) {
          this.logger.debug(
            `[MATCH-NOTIFY] skip user=${userId} — score=${score} too low`,
          );
          continue;
        }

        // Send push
        await this.notifications.aiMatchFound(userId, {
          productTitle: product.title,
          productId: product.id,
          ownerName: product.owner?.name ?? 'Someone',
          score,
          reason,
        });

        // Throttle 12 hours
        await this.redis.set(throttleKey, '1', 12 * 60 * 60);

        this.logger.log(
          `[MATCH-NOTIFY] ✅ sent to user=${userId} score=${score}`,
        );
      } catch (err) {
        this.logger.error(
          `[MATCH-NOTIFY] failed for user=${userId}: ${(err as Error).message}`,
        );
      }
    }
  }

   private async formatResponse(
    allMatches: MatchResult[],
    tier: 'FREE' | 'PRO',
    _total: number,
  ) {
    const limits = tierLimits(tier);

    // ═══════════════════════════════════════════════
    //  PRO — full access, no teasers, no upgrade prompt
    // ═══════════════════════════════════════════════
    if (tier === 'PRO') {
      return {
        matches: allMatches,
        teaserMatches: [] as any[],
        totalCount: allMatches.length,
        hiddenCount: 0,
        visibleLimit: null,
        tier,
        aiRanked: this.ai.isReady,
        upgradeUrl: null,
      };
    }

    // ═══════════════════════════════════════════════
    //  FREE — 3 full matches + up to 5 blurred teasers
    // ═══════════════════════════════════════════════
    const visibleCount = limits.matchVisibleCount as number;
    const teaserCount = limits.matchTeaserCount as number;

    const visible = allMatches.slice(0, visibleCount);
    const hidden = allMatches.slice(visibleCount);
    const teaserSource = hidden.slice(0, teaserCount);

    // Strip sensitive info — no title, no owner name, no description
    const teaserMatches = teaserSource.map((m) => ({
      id: m.product.id,
      // Only the first image, for a blurred preview
      image: (m.product.images as string[])?.[0] ?? null,
      // Rounded score (doesn't expose exact ranking)
      score: Math.round(m.score / 5) * 5,
      // Category is safe — helps user gauge what they're missing
      categoryName: m.product.category?.name ?? null,
      categoryIcon: m.product.category?.icon ?? null,
      // Approximate value (rounded to nearest 50)
      estimatedValue: m.product.estimatedValue
        ? Math.round(m.product.estimatedValue / 50) * 50
        : null,
      // Marker so client knows this is a locked teaser
      locked: true,
    }));

    return {
      matches: visible,
      teaserMatches,
      totalCount: allMatches.length,
      hiddenCount: hidden.length,
      visibleLimit: visibleCount,
      tier,
      aiRanked: this.ai.isReady,
      upgradeUrl: '/billing/upgrade',
    };
  }
}