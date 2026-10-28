// src/config/env.validation.ts
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  // ─── Database ───
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  // ─── JWT ───
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),

  // ─── Google OAuth ───
  // Required for /auth/google (mobile Google Sign-In).
  // Must match AppConfig.googleWebClientId in the Flutter app.
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),

  // ─── Firebase Admin (push notifications) ───
  FIREBASE_PROJECT_ID: Joi.string().allow('').optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().allow('').optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().allow('').optional(),

  // ─── Redis (cache + rate limiting) ───
  REDIS_URL: Joi.string().allow('').optional(),
  REDIS_PREFIX: Joi.string().default('barter:'),
  CACHE_TTL_SECONDS: Joi.number().integer().min(1).max(3600).default(60),

  // ─── Email / OTP (Resend) ───
  RESEND_API_KEY: Joi.string().allow('').optional(),
  RESEND_FROM: Joi.string().optional(),

  // ─── AI (matching + product analysis) ───
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  OPENAI_BASE_URL: Joi.string().uri().optional(),
  OPENAI_MODEL: Joi.string().default('gpt-4o-mini'),

  // ─── Sentry ───
  SENTRY_DSN: Joi.string().uri().allow('').optional(),
  SENTRY_RELEASE: Joi.string().optional(),

  // ─── App / CORS ───
  CORS_ORIGINS: Joi.string().required(),
  FRONTEND_URL: Joi.string().optional(),
  MAX_BODY_SIZE: Joi.string().default('5mb'),
  TRUST_PROXY: Joi.string().valid('true', 'false').default('false'),
});