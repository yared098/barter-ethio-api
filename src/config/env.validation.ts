import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),

  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),

  FIREBASE_PROJECT_ID: Joi.string().allow('').optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().allow('').optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().allow('').optional(),

  CORS_ORIGINS: Joi.string().required(),
  MAX_BODY_SIZE: Joi.string().default('5mb'),
  TRUST_PROXY: Joi.string().valid('true', 'false').default('false'),
});
