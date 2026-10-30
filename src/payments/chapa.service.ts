import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface ChapaInitRes {
  status: string;
  message: string;
  data?: { checkout_url: string };
}

interface ChapaVerifyRes {
  status: string;
  message: string;
  data?: {
    tx_ref: string;
    status: 'success' | 'failed' | 'pending';
    amount: string;
    currency: string;
    reference: string;
    method: string;
    [k: string]: any;
  };
}

@Injectable()
export class ChapaService {
  private readonly log = new Logger(ChapaService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const secret = config.get<string>('CHAPA_SECRET_KEY');
    if (!secret) {
      throw new Error('CHAPA_SECRET_KEY is missing from .env');
    }

    this.http = axios.create({
      baseURL:
        config.get<string>('CHAPA_BASE_URL') ?? 'https://api.chapa.co/v1',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
    });
  }

  async initialize(p: {
    amount: number;
    currency: string;
    email: string;
    firstName: string;
    lastName: string;
    txRef: string;
    callbackUrl: string;
    returnUrl: string;
    title: string;
    description: string;
  }): Promise<{ checkoutUrl: string }> {
    try {
      const { data } = await this.http.post<ChapaInitRes>(
        '/transaction/initialize',
        {
          amount: p.amount.toFixed(2),
          currency: p.currency,
          email: p.email,
          first_name: p.firstName,
          last_name: p.lastName,
          tx_ref: p.txRef,
          callback_url: p.callbackUrl,
          return_url: p.returnUrl,
          'customization[title]': p.title,
          'customization[description]': p.description,
        },
      );

      if (data.status !== 'success' || !data.data?.checkout_url) {
        throw new Error(data.message || 'Chapa init failed');
      }
      return { checkoutUrl: data.data.checkout_url };
    } catch (err: any) {
      this.log.error(
        'Chapa initialize failed',
        err?.response?.data ?? err.message,
      );
      throw new Error(
        err?.response?.data?.message ?? 'Payment provider error',
      );
    }
  }

  async verify(txRef: string): Promise<{
  verified: boolean;
  amount: number | null;
  currency: string | null;
  status: string | null;
  raw: any;
} | null> {
  try {
    const { data } = await this.http.get(...);
    
    this.log.log(`[verify] ${txRef} → HTTP ${data.status} dataStatus=${data.data?.status}`);
    
    const success =
      data.status === 'success' &&
      data.data?.status === 'success';
    
    return {
      verified: success,
      amount: data.data?.amount ? Number(data.data.amount) : null,
      currency: data.data?.currency ?? null,
      status: data.data?.status ?? null,
      raw: data,
    };
  } catch (err) {
    this.log.warn(`verify failed for ${txRef}: ${err.message}`);
    return null;
  }
}
}