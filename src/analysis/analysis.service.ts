import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AiService } from './ai.service';

export interface ProductAnalysis {
  productId: string;
  price: {
    position: 'low' | 'fair' | 'high';
    yourPrice: number;
    min: number;
    max: number;
    avg: number;
    median: number;
    sampleSize: number;
    verdict: string;
  };
  tradeBalance: {
    yourValue: number;
    wantedAvgValue: number;
    ratio: number;
    isBalanced: boolean;
    sampleSize: number;
    verdict: string;
  } | null;
  market: {
    potentialMatches: number;
    wantedCategories: {
      name: string;
      icon: string | null;
      productCount: number;
    }[];
  };
  description: {
    length: number;
    quality: 'poor' | 'ok' | 'good' | 'excellent';
    score: number;
    tips: string[];
  };
  suggestions: string[];
  aiAdvice: string | null;
  generatedAt: string;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
  ) {}

  async analyze(productId: string, userId: string): Promise<ProductAnalysis> {
    const cacheKey = `analysis:product:${productId}`;

    const cached = await this.redis.get<ProductAnalysis>(cacheKey);
    if (cached) {
      this.logger.debug(`[ANALYSIS] cache hit for ${productId}`);
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        wants: { include: { category: true } },
      },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.ownerId !== userId) {
      throw new ForbiddenException('Not your product');
    }

    // ── 1. Price analysis ──
    const comparables = await this.prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
        status: 'AVAILABLE',
      },
      select: { estimatedValue: true },
    });

    const prices = comparables
      .map((p) => p.estimatedValue)
      .sort((a, b) => a - b);
    const sampleSize = prices.length;
    const min = sampleSize > 0 ? prices[0] : 0;
    const max = sampleSize > 0 ? prices[sampleSize - 1] : 0;
    const avg =
      sampleSize > 0 ? prices.reduce((a, b) => a + b, 0) / sampleSize : 0;
    const median =
      sampleSize > 0
        ? sampleSize % 2 === 0
          ? (prices[sampleSize / 2 - 1] + prices[sampleSize / 2]) / 2
          : prices[Math.floor(sampleSize / 2)]
        : 0;

    const position = this.getPosition(
      product.estimatedValue,
      avg,
      sampleSize,
    );
    const verdict = this.getPriceVerdict(
      product.estimatedValue,
      min,
      max,
      avg,
      position,
      sampleSize,
    );

    // ── 2. Trade balance ──
    const wantedCategoryIds = product.wants.map((w) => w.categoryId);
    let tradeBalance: ProductAnalysis['tradeBalance'] = null;

    if (wantedCategoryIds.length > 0) {
      const wantedProducts = await this.prisma.product.findMany({
        where: {
          categoryId: { in: wantedCategoryIds },
          status: 'AVAILABLE',
        },
        select: { estimatedValue: true },
      });

      if (wantedProducts.length > 0) {
        const wantedAvgValue =
          wantedProducts.reduce((a, b) => a + b.estimatedValue, 0) /
          wantedProducts.length;
        const ratio = product.estimatedValue / wantedAvgValue;
        const isBalanced = ratio >= 0.7 && ratio <= 1.4;

        tradeBalance = {
          yourValue: product.estimatedValue,
          wantedAvgValue: Math.round(wantedAvgValue),
          ratio: Math.round(ratio * 100) / 100,
          isBalanced,
          sampleSize: wantedProducts.length,
          verdict: isBalanced
            ? `Good balance — your product is worth about the same as typical products in the categories you want.`
            : ratio > 1.4
              ? `Your product is worth ${ratio.toFixed(1)}× more than typical products in your wanted categories. Consider asking for higher-value items.`
              : `Your product is worth less than typical products in your wanted categories (${(1 / ratio).toFixed(1)}× less). You may need to add value or adjust your wants.`,
        };
      }
    }

    // ── 3. Market potential ──
    const wantedCategoriesWithCounts = await Promise.all(
      product.wants.map(async (w) => {
        const count = await this.prisma.product.count({
          where: {
            categoryId: w.categoryId,
            ownerId: { not: userId },
            status: 'AVAILABLE',
          },
        });
        return {
          name: w.category.name,
          icon: w.category.icon,
          productCount: count,
        };
      }),
    );

    const potentialMatches = wantedCategoriesWithCounts.reduce(
      (a, b) => a + b.productCount,
      0,
    );

    // ── 4. Description quality ──
    const desc = this.scoreDescription(
      product.description,
      product.images.length,
    );

    // ── 5. Suggestions (rule-based) ──
    const suggestions = this.buildSuggestions({
      price: {
        position,
        sampleSize,
        min,
        max,
        avg,
        yourPrice: product.estimatedValue,
      },
      tradeBalance,
      description: desc,
      market: { potentialMatches },
      images: product.images.length,
    });

    // ── 6. AI enrichment ──
    let aiAdvice: string | null = null;
    if (this.ai.isReady) {
      const prompt = this.buildAiPrompt(product, {
        price: {
          position,
          sampleSize,
          min,
          max,
          avg,
          yourPrice: product.estimatedValue,
        },
        tradeBalance,
        market: { potentialMatches, wantedCategoriesWithCounts },
        description: desc,
        images: product.images.length,
      });
      aiAdvice = await this.ai.generateAdvice(prompt);
    }

    const analysis: ProductAnalysis = {
      productId: product.id,
      price: {
        position,
        yourPrice: product.estimatedValue,
        min: Math.round(min),
        max: Math.round(max),
        avg: Math.round(avg),
        median: Math.round(median),
        sampleSize,
        verdict,
      },
      tradeBalance,
      market: {
        potentialMatches,
        wantedCategories: wantedCategoriesWithCounts,
      },
      description: {
        length: product.description.length,
        quality: desc.quality,
        score: desc.score,
        tips: desc.tips,
      },
      suggestions,
      aiAdvice,
      generatedAt: new Date().toISOString(),
    };

    await this.redis.set(cacheKey, analysis, 300);

    return analysis;
  }

  private getPosition(
    yourPrice: number,
    avg: number,
    sampleSize: number,
  ): 'low' | 'fair' | 'high' {
    if (sampleSize === 0) return 'fair';
    const ratio = yourPrice / avg;
    if (ratio < 0.8) return 'low';
    if (ratio > 1.25) return 'high';
    return 'fair';
  }

  private getPriceVerdict(
    yourPrice: number,
    min: number,
    max: number,
    avg: number,
    position: 'low' | 'fair' | 'high',
    sampleSize: number,
  ): string {
    if (sampleSize === 0) {
      return `You're the first in this category — price is unverified.`;
    }
    if (sampleSize < 3) {
      return `Only ${sampleSize} similar product${sampleSize === 1 ? '' : 's'} listed (ETB ${Math.round(min)}-${Math.round(max)}).`;
    }
    if (position === 'fair') {
      return `Your price (ETB ${yourPrice}) is in the middle range. ${sampleSize} similar products average ETB ${Math.round(avg)}.`;
    }
    if (position === 'high') {
      return `Your price (ETB ${yourPrice}) is ${(yourPrice / avg).toFixed(1)}× higher than the average (ETB ${Math.round(avg)}). You may struggle to find matches.`;
    }
    return `Your price (ETB ${yourPrice}) is lower than average (ETB ${Math.round(avg)}). Great value — likely to attract more matches.`;
  }

  private scoreDescription(
    description: string,
    imageCount: number,
  ): { quality: 'poor' | 'ok' | 'good' | 'excellent'; score: number; tips: string[] } {
    const length = description.trim().length;
    const tips: string[] = [];

    let score = 0;
    if (length > 20) score += 20;
    if (length > 80) score += 20;
    if (length > 150) score += 15;
    if (/[.!?]/.test(description)) score += 10;
    if (imageCount > 0) score += 20;
    if (imageCount > 1) score += 10;
    if (/year|old|condition|scratch|battery|warranty|box|charger/i.test(description)) score += 5;

    const quality: 'poor' | 'ok' | 'good' | 'excellent' =
      score < 40
        ? 'poor'
        : score < 65
          ? 'ok'
          : score < 85
            ? 'good'
            : 'excellent';

    if (length < 50) tips.push('Add more details — buyers trust detailed descriptions.');
    if (imageCount === 0) tips.push('Add at least one photo. Listings with photos get 3× more offers.');
    if (!/year|old|condition|battery|scratch|warranty/i.test(description)) {
      tips.push('Mention condition — battery health, scratches, age, accessories.');
    }

    return { quality, score, tips };
  }

  private buildSuggestions(ctx: {
    price: { position: 'low' | 'fair' | 'high'; sampleSize: number; min: number; max: number; avg: number; yourPrice: number };
    tradeBalance: ProductAnalysis['tradeBalance'];
    description: { quality: string; tips: string[] };
    market: { potentialMatches: number };
    images: number;
  }): string[] {
    const tips: string[] = [];

    if (ctx.price.position === 'high' && ctx.price.sampleSize >= 3) {
      tips.push(
        `Consider lowering the price to ~ETB ${Math.round(ctx.price.avg * 1.1)} (10% above market average).`,
      );
    }
    if (ctx.price.position === 'low' && ctx.price.sampleSize >= 3) {
      tips.push(`Your price is a good deal — expect many offers.`);
    }
    if (
      ctx.tradeBalance &&
      !ctx.tradeBalance.isBalanced &&
      ctx.tradeBalance.ratio > 1.4
    ) {
      tips.push(
        `Your product is worth ${ctx.tradeBalance.ratio.toFixed(1)}× more than what you want — add higher-value categories.`,
      );
    }
    if (ctx.market.potentialMatches === 0) {
      tips.push(`No matching products yet in your wanted categories. Try adding more categories.`);
    } else if (ctx.market.potentialMatches >= 5) {
      tips.push(`${ctx.market.potentialMatches} potential matches in your wanted categories.`);
    }
    if (ctx.images === 0) {
      tips.push(`Add a photo — listings with photos get 3× more offers.`);
    }

    return tips;
  }

  private buildAiPrompt(product: any, data: any): string {
    return `Analyze this barter listing and give 2-3 sentences of specific, friendly advice.

Product: "${product.title}"
Category: ${product.category.name}
Condition: ${product.condition}
Your price: ETB ${product.estimatedValue}
Description length: ${product.description.length} chars
Images: ${product.images.length}
Potential matches: ${data.market.potentialMatches}

Market data:
- Similar products: ${data.price.sampleSize}
- Price range: ETB ${data.price.min}-${data.price.max}
- Average: ETB ${data.price.avg}
- Your position: ${data.price.position}
${data.tradeBalance ? `- Trade balance: you're offering ${data.tradeBalance.ratio}× the value of what you want` : ''}

Give specific, actionable advice. If price is off, suggest a specific number. Keep under 3 sentences.`;
  }
}