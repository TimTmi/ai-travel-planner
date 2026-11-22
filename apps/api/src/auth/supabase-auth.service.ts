import { Injectable } from '@nestjs/common';
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { requireEnv } from '../env';
import { ProblemException } from '../problems/problem.exception';

type KeyResolver = ReturnType<typeof createLocalJWKSet> | ReturnType<typeof createRemoteJWKSet>;

@Injectable()
export class SupabaseAuthService {
  private cachedKeySource: string | undefined;
  private cachedKeyResolver: KeyResolver | undefined;

  async verifyAccessToken(token: string): Promise<{ userId: string }> {
    const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
    const issuer = `${supabaseUrl}/auth/v1`;
    const keyResolver = this.getKeyResolver(supabaseUrl);

    try {
      const { payload } = await jwtVerify(token, keyResolver, {
        issuer,
        audience: 'authenticated',
        requiredClaims: ['exp', 'sub'],
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('Missing sub claim');
      }

      return { userId: payload.sub };
    } catch {
      throw new ProblemException('unauthenticated', 'The access token is invalid or has expired.');
    }
  }

  private getKeyResolver(supabaseUrl: string): KeyResolver {
    const localJwksJson = process.env['SUPABASE_JWKS_JSON'];
    const sourceKey = localJwksJson ? `local:${localJwksJson}` : `remote:${supabaseUrl}`;

    if (this.cachedKeySource === sourceKey && this.cachedKeyResolver) {
      return this.cachedKeyResolver;
    }

    const resolver: KeyResolver = localJwksJson
      ? createLocalJWKSet(JSON.parse(localJwksJson) as JSONWebKeySet)
      : createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

    this.cachedKeySource = sourceKey;
    this.cachedKeyResolver = resolver;
    return resolver;
  }
}
