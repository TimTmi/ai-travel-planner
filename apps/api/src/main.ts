import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_OPTIONS } from './app.options';
import { requireEnv } from './env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, APP_OPTIONS);
  app.enableShutdownHooks();
  await app.listen(Number(requireEnv('API_PORT')));
}

void bootstrap();
