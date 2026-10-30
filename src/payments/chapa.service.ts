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

      this.log.log(
        `[initialize] ${p.txRef} → wrapper=${data.status} url=${data.data?.checkout_url ?? 'none'}`,
      );

      if (data.status !== 'success' || !data.data?.checkout_url) {
        throw new Error(data.message || 'Chapa init failed');
      }
      return { checkoutUrl: data.data.checkout_url };
    } catch (err: any) {
      this.log.error(
        `[initialize] ${p.txRef} FAILED: status=${err?.response?.status} message=${err?.response?.data?.message ?? err.message}`,
      );
      throw new Error(
        err?.response?.data?.message ?? 'Payment provider error',
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // VERIFY — with full diagnostic logging so we know WHY it fails
  // ─────────────────────────────────────────────────────────
  async verify(txRef: string): Promise<ChapaVerifyRes['data'] | null> {
    try {
      const { data } = await this.http.get<ChapaVerifyRes>(
        `/transaction/verify/${encodeURIComponent(txRef)}`,
      );

      // 🔍 LOG EVERYTHING — this is what was missing before
      this.log.log(
        `[verify] ${txRef} → HTTP=success` +
          ` wrapperStatus=${data.status}` +
          ` wrapperMessage="${data.message}"` +
          ` dataStatus=${data.data?.status ?? 'none'}` +
          ` amount=${data.data?.amount ?? 'none'}`,
      );

      if (data.status !== 'success') {
        this.log.warn(
          `[verify] ${txRef} — Chapa wrapper FAILED: ${data.message}`,
        );
        return null;
      }

      return data.data ?? null;
    } catch (err: any) {
      this.log.warn(
        `[verify] ${txRef} — HTTP error: status=${err?.response?.status ?? 'no-response'} message=${err?.response?.data?.message ?? err.message}`,
      );
      return null;
    }
  }
}