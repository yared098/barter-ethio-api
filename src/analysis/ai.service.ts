import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface RerankCandidate {
  id: string;
  title: string;
  category: string;
  value: number;
  condition: string;
}

export interface RerankResult {
  id: string;
  score: number;
  reason: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: config.get<string>('OPENAI_BASE_URL') ?? undefined,
      });
      this.logger.log('✅ AI service ready — matching + advice enabled');
    } else {
      this.logger.warn('⚠️ OPENAI_API_KEY not set — rule-based only');
    }
  }

  get isReady(): boolean {
    return this.client !== null;
  }

  async generateAdvice(prompt: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.chat.completions.create({
        model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a barter advisor for Barter Ethio. 2-3 sentences. Be specific. No fluff.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      });
      return res.choices[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      this.logger.error(`Advice failed: ${(err as Error).message}`);
      return null;
    }
  }

  async rerankMatches(
    myProducts: Array<{ title: string; categoryName: string; value: number }>,
    wants: Array<{ categoryName: string; keywords?: string | null }>,
    candidates: RerankCandidate[],
  ): Promise<RerankResult[]> {
    if (!this.client || candidates.length === 0) return [];

    const limited = candidates.slice(0, 15);

    const prompt = `You are ranking barter matches for Barter Ethio.

USER HAS:
${myProducts.map((p, i) => `${i + 1}. "${p.title}" — ${p.categoryName}, ETB ${p.value}`).join('\n')}

USER WANTS (in exchange):
${wants.map((w) => `- ${w.categoryName}${w.keywords ? `, specifically: "${w.keywords}"` : ''}`).join('\n')}

CANDIDATES:
${limited.map((c, i) => `${i + 1}. [id=${c.id}] "${c.title}" — ${c.category}, ETB ${c.value}, ${c.condition}`).join('\n')}

Score each candidate 0-100 for how well it satisfies the user's wants:
- 90-100: exact product type + keyword match + fair value
- 70-89: right category, slightly off on keyword or value
- 50-69: right category, no keyword match, or value mismatch
- 30-49: related but questionable
- 0-29: wrong product type or wildly different value

CRITICAL:
- "Sony WH-1000XM5" DOES satisfy "audio, Sony" → high
- "Sony Bravia TV" does NOT satisfy "audio, Sony" → low (wrong product)
- Value matters — don't score 90 if 10x price difference

Return ONLY valid JSON:
{"scores":[{"id":"...","score":0,"reason":"one sentence"}]}`;

    try {
      const res = await this.client.chat.completions.create({
        model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at matching barter products. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 800,
      });

      const content = res.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content) as { scores?: RerankResult[] };
      const validIds = new Set(limited.map((c) => c.id));

      return (parsed.scores ?? [])
        .filter((s) => validIds.has(s.id) && typeof s.score === 'number')
        .map((s) => ({
          id: s.id,
          score: Math.max(0, Math.min(100, Math.round(s.score))),
          reason: (s.reason ?? '').slice(0, 200),
        }));
    } catch (err) {
      this.logger.error(`Rerank failed: ${(err as Error).message}`);
      return [];
    }
  }
}