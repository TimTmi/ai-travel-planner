import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma.service';
import { createLocalAuthEnv, type LocalAuthEnv } from './test-auth';

export interface TestAppHarness {
  app: INestApplication<App>;
  prisma: PrismaService;
  auth: LocalAuthEnv;
  resetDatabase(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestAppHarness> {
  const auth = await createLocalAuthEnv();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();

  const prisma = app.get(PrismaService);

  const resetDatabase = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE plans, group_members, groups, users RESTART IDENTITY CASCADE',
    );
  };

  const close = async (): Promise<void> => {
    await app.close();
    auth.restore();
  };

  return { app, prisma, auth, resetDatabase, close };
}
