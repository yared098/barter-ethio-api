export interface PlanDef {
  id: string;
  label: string;
  price: number;
  currency: 'ETB';
  description: string;
  dailyCap: number;
  periodLimit: number | null;
  periodDays: number | null;
  tier: 'daily' | 'credit' | 'pro';
  badgeKey?: string;
  highlighted?: boolean;
}

export const FREE_DAILY_CAP = 1;

export const PLANS: Record<string, PlanDef> = {
  daily_pass: {
    id: 'daily_pass',
    label: 'Daily Pass',
    price: 50,
    currency: 'ETB',
    description: '2 posts today · expires at midnight',
    dailyCap: 2,
    periodLimit: 2,
    periodDays: 1,
    tier: 'daily',
  },

  credit_100: {
    id: 'credit_100',
    label: '100 Posts',
    price: 50,
    currency: 'ETB',
    description: 'never expires · max 2/day',
    dailyCap: 2,
    periodLimit: 100,
    periodDays: null,
    tier: 'credit',
  },
  credit_500: {
    id: 'credit_500',
    label: '500 Posts',
    price: 200,
    currency: 'ETB',
    description: 'never expires · max 2/day',
    dailyCap: 2,
    periodLimit: 500,
    periodDays: null,
    tier: 'credit',
    badgeKey: 'save_20',
  },
  credit_1000: {
    id: 'credit_1000',
    label: '1000 Posts',
    price: 350,
    currency: 'ETB',
    description: 'never expires · max 2/day',
    dailyCap: 2,
    periodLimit: 1000,
    periodDays: null,
    tier: 'credit',
    badgeKey: 'best_value',
    highlighted: true,
  },

  pro_15d: {
    id: 'pro_15d',
    label: 'PRO · 15 days',
    price: 129,
    currency: 'ETB',
    description: '30 posts · max 2/day',
    dailyCap: 2,
    periodLimit: 30,
    periodDays: 15,
    tier: 'pro',
  },
  monthly_pro: {
    id: 'monthly_pro',
    label: 'PRO · 30 days',
    price: 199,
    currency: 'ETB',
    description: '60 posts · max 2/day',
    dailyCap: 2,
    periodLimit: 60,
    periodDays: 30,
    tier: 'pro',
  },
  pro_6mo: {
    id: 'pro_6mo',
    label: 'PRO · 6 months',
    price: 999,
    currency: 'ETB',
    description: '360 posts · max 2/day',
    dailyCap: 2,
    periodLimit: 360,
    periodDays: 180,
    tier: 'pro',
    badgeKey: 'save_16',
  },
  yearly_pro: {
    id: 'yearly_pro',
    label: 'PRO · 1 year',
    price: 1799,
    currency: 'ETB',
    description: '720 posts · max 2/day',
    dailyCap: 2,
    periodLimit: 720,
    periodDays: 365,
    tier: 'pro',
    badgeKey: 'save_25',
    highlighted: true,
  },
};