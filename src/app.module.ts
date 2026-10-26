import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { FirebaseModule } from './firebase/firebase.module';
import { MatchesModule } from './matches/matches.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OffersModule } from './offers/offers.module';
import { ProductsModule } from './products/products.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './prisma/prisma.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    // ─── Config with fail-fast env validation ───
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // ─── Global rate limiter: 100 requests / 60s per IP ───
    // Individual routes override with @Throttle({ default: { limit: N, ttl: M } })
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
    ]),

    PrismaModule,
    FirebaseModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    MatchesModule,
    OffersModule,
    UploadsModule,
  ],
  providers: [
    // ─── Guard order matters (top → bottom) ───
    // 1. Rate limit first (before expensive work)
    // 2. Then auth (populates req.user)
    // 3. Then roles (reads req.user.role)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
