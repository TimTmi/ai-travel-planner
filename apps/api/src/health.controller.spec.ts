import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import type { PrismaService } from './prisma.service';

describe('HealthController', () => {
  it('reports ok after the database answers', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('fails when the database does not answer', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('connection refused'));
    const controller = new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(controller.check()).rejects.toThrow('connection refused');
  });
});
