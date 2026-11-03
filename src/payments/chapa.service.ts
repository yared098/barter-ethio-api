

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

    this.log.log(
      `ChapaService init: baseURL=${
        config.get<string>('CHAPA_BASE_URL') ?? 'https://api.chapa.co/v1'
      } keyPreview=${secret.slice(0, 12)}… (${secret.length} chars)`,
    );
  }

  async initialize(p: {
    amount: number;
    currency: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    txRef: string;
    callbackUrl: string;
    returnUrl: string;
    title: string;
    description: string;
  }): Promise<{ checkoutUrl: string }> {
    const description =
      p.description
        .replace(/[^A-Za-z0-9 _.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Barter payment';

    // ⭐ THE FIX — nested customization object + phone_number
    const body = {
      amount: p.amount.toFixed(2),
      currency: p.currency,
      email: p.email ??'yades.dev@gmail.com',
      first_name: p.firstName,
      last_name: p.lastName,
      phone_number: p.phoneNumber ?? '0900000000',
      tx_ref: p.txRef,
      callback_url: p.callbackUrl,
      return_url: p.returnUrl,
      customization: {
        title: p.title,
        description,
      },
    };

    this.log.log(
      `[initialize] ${p.txRef} → POST /transaction/initialize body=${JSON.stringify(
        body,
      )}`,
    );

    try {
      const { data } = await this.http.post<ChapaInitRes>(
        '/transaction/initialize',
        body,
      );

      this.log.log(
        `[initialize] ${p.txRef} → wrapper=${data.status} url=${
          data.data?.checkout_url ?? 'none'
        }`,
      );

      if (data.status !== 'success' || !data.data?.checkout_url) {
        const msg =
          typeof data.message === 'string'
            ? data.message
            : JSON.stringify(data.message ?? data);
        throw new Error(msg);
      }
      return { checkoutUrl: data.data.checkout_url };
    } catch (err: any) {
      const status = err?.response?.status ?? 'no-response';
      const respBody = err?.response?.data;

      // ⭐ Extract a readable message from any Chapa error shape
      let detail = 'Payment provider error';
      if (respBody) {
        if (typeof respBody.message === 'string') {
          detail = respBody.message;
        } else if (respBody.message && typeof respBody.message === 'object') {
          detail = Object.entries(respBody.message)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('; ');
        } else if (respBody.errors && typeof respBody.errors === 'object') {
          detail = Object.entries(respBody.errors)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('; ');
        } else {
          detail = JSON.stringify(respBody);
        }
      } else {
        detail = err?.message ?? detail;
      }

      this.log.error(
        `[initialize] ${p.txRef} FAILED: status=${status} detail="${detail}"`,
      );
      this.log.error(
        `[initialize] full response: ${JSON.stringify(respBody ?? {})}`,
      );

      throw new Error(detail);
    }
  }

  async verify(txRef: string): Promise<ChapaVerifyRes['data'] | null> {
    try {
      const { data } = await this.http.get<ChapaVerifyRes>(
        `/transaction/verify/${encodeURIComponent(txRef)}`,
      );

      this.log.log(
        `[verify] ${txRef} → HTTP=success` +
          ` wrapperStatus=${data.status}` +
          ` wrapperMessage="${data.message}"` +
          ` dataStatus=${data.data?.status ?? 'none'}` +
          ` amount=${data.data?.amount ?? 'none'}`,
      );

      if (data.status !== 'success') {
        this.log.error(
          `❌ UNABLE TO VERIFY ${txRef}: wrapper status="${data.status}" message="${data.message}"`,
        );
        return null;
      }
      if (!data.data) {
        this.log.error(
          `❌ UNABLE TO VERIFY ${txRef}: success but data is empty`,
        );
        return null;
      }

      this.log.log(
        `✅ Verified ${txRef}: status="${data.data.status}" amount=${data.data.amount} ${data.data.currency}`,
      );
      return data.data;
    } catch (err: any) {
      const status = err?.response?.status ?? 'no-response';
      const chapaMessage =
        err?.response?.data?.message ?? err?.message ?? 'unknown error';

      if (status === 404) {
        this.log.error(
          `❌ UNABLE TO VERIFY ${txRef}: 404 Not Found — tx_ref doesn't exist in Chapa.`,
        );
      } else if (status === 401) {
        this.log.error(
          `❌ UNABLE TO VERIFY ${txRef}: 401 Unauthorized — CHAPA_SECRET_KEY invalid.`,
        );
      } else {
        this.log.error(
          `❌ UNABLE TO VERIFY ${txRef}: HTTP ${status} — ${chapaMessage}`,
        );
      }
      return null;
    }
  }
}