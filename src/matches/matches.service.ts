import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectiveTier, tierLimits } from '../common/helpers/tier';

export interface MatchResult {
  product: any;
  score: number;
  reasons: string[];
  wantsMatch: { categoryId: string; keywords?: string | null };
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Build set of "categories I want" and my owned categories
    const wantedCategoryIds = new Set<string>();
    const myCategoryIds = new Set<string>();
    const myMaxValue = Math.max(...myProducts.map(p => p.estimatedValue));
    for (const p of myProducts) {
      myCategoryIds.add(p.categoryId);
      for (const w of p.wants) wantedCategoryIds.add(w.categoryId);
    }

    // Candidate products: other users' AVAILABLE products in categories I want
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
      // The candidate must match at least one "want" on one of my products
      for (const myProduct of myProducts) {
        const matchingWant = myProduct.wants.find(
          w => w.categoryId === candidate.categoryId,
        );
        if (!matchingWant) continue;

        const reasons: string[] = [];
        let score = 40; // base: category matches one of my wants
        reasons.push(`Matches your "${matchingWant.category.name}" want`);

        // Bidirectional: does candidate want something I have?
        const bidirectional = candidate.wants.some(w =>
          myCategoryIds.has(w.categoryId),
        );
        if (bidirectional) {
          score += 40;
          reasons.push("They also want what you have");
        }

        // Value proximity (my max value vs their product)
        const diffRatio =
          Math.abs(candidate.estimatedValue - myMaxValue) / myMaxValue;
        const valueScore = Math.max(0, 20 * (1 - diffRatio));
        score += valueScore;
        if (valueScore > 12) reasons.push('Similar estimated value');

        // Keyword hit
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
        });

        break; // one match per candidate
      }
    }

    // Sort by score descending, dedupe by product id
    const seen = new Set<string>();
    const unique = scored
      .sort((a, b) => b.score - a.score)
      .filter(m => {
        if (seen.has(m.product.id)) return false;
        seen.add(m.product.id);
        return true;
      });

    const tier = await getEffectiveTier(this.prisma, userId);
    return this.formatResponse(unique, tier, unique.length);
  }

  private async formatResponse(
    allMatches: MatchResult[],
    tier: 'FREE' | 'PRO',
    _totalForDebug: number,
  ) {
    // tier may need re-fetch if called early; safe to re-read
    const limits = tierLimits(tier);
    const visible =
      tier === 'PRO'
        ? allMatches
        : allMatches.slice(0, limits.matchVisibleCount as number);

    return {
      matches: visible,
      totalCount: allMatches.length,
      hiddenCount: allMatches.length - visible.length,
      tier,
      upgradeUrl: tier === 'FREE' && allMatches.length > visible.length
        ? '/billing/upgrade'
        : null,
    };
  }
}