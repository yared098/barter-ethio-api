import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import * as os from 'os';
import { join } from 'path';
import { mkdir } from 'fs/promises';

async function bootstrap() {
  // bodyParser:false → we register our own with size limit
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProd = config.get('NODE_ENV') === 'production';
  const port = Number(config.get('PORT')) || 3000;

  // ─── Trust proxy (Railway/Render need this for real client IP) ───
  if (config.get('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
    logger.log('✅ Trust proxy enabled');
  }

  // ─── Helmet security headers ───
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              connectSrc: ["'self'", 'https:'],
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  logger.log('✅ Helmet security headers enabled');

  app.use(cookieParser());

  // ─── Body size limits ───
  const bodyLimit = config.get<string>('MAX_BODY_SIZE') ?? '5mb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });
  logger.log(`✅ Body size limit: ${bodyLimit}`);

  // ─── HTTPS redirect (production only) ───
  if (isProd) {
    app.use((req: any, res: any, next: any) => {
      const proto = req.header('x-forwarded-proto');
      const host = req.header('host') ?? '';
      if (proto !== 'https' && host && !host.includes('localhost')) {
        return res.redirect(301, `https://${host}${req.url}`);
      }
      next();
    });
    logger.log('✅ HTTPS redirect enabled');
  }

  // ─── CORS strict allowlist ───
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins.length === 0 && isProd) {
    throw new Error('❌ CORS_ORIGINS must be set in production');
  }

  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Total-Count'],
    maxAge: 86400,
  });
  logger.log(
    `✅ CORS: ${origins.length > 0 ? origins.join(', ') : 'all origins (dev only)'}`,
  );

  // ─── Static uploads ───
  const uploadsDir = join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    maxAge: '7d',
  });

  // ─── Global API prefix (uploads excluded) ───
  app.setGlobalPrefix('api/v1', {
    exclude: ['uploads/(.*)'],
  });

  // ─── Validation ───
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Hide tech stack ───
  app.disable('x-powered-by');

  // ─── Graceful shutdown ───
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  // ─── Startup log ───
  if (process.env.RENDER || isProd) {
    logger.log(`🚀 API running on port ${port}`);
    return;
  }

  const nets = os.networkInterfaces();
  const lanIps: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIps.push(net.address);
      }
    }
  }

  logger.log(`🚀 Local:   http://localhost:${port}/api/v1`);
  for (const ip of lanIps) {
    logger.log(`📱 LAN:     http://${ip}:${port}/api/v1`);
  }
  logger.log(`🤖 Emu:     http://10.0.2.2:${port}/api/v1  (Android emulator)`);
  logger.log(`🖼️  Files:   http://localhost:${port}/uploads/...`);
  logger.log(`   Environment: ${config.get('NODE_ENV') ?? 'development'}`);
}

bootstrap();
