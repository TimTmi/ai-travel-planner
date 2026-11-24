import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard';
import { SupabaseAuthService } from './auth/supabase-auth.service';
import { SpendingCapController } from './groups/spending-cap.controller';
import { SpendingCapService } from './groups/spending-cap.service';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { ProblemDetailsFilter } from './problems/problem-details.filter';

@Module({
  controllers: [HealthController, SpendingCapController],
  providers: [
    PrismaService,
    SupabaseAuthService,
    SupabaseAuthGuard,
    SpendingCapService,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
