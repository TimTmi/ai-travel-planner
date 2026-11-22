import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface SignTokenOptions {
  sub?: string | null;
  aud?: string;
  iss?: string;
  exp?: number;
}

export interface LocalAuthEnv {
  supabaseUrl: string;
  issuer: string;
  signToken(options?: SignTokenOptions): Promise<string>;
  signWithWrongKey(sub: string): Promise<string>;
  restore(): void;
}

const DEFAULT_SUPABASE_URL = 'https://test.supabase.local';
const KEY_ID = 'local-test-key-1';

export async function createLocalAuthEnv(
  supabaseUrl = DEFAULT_SUPABASE_URL,
): Promise<LocalAuthEnv> {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = KEY_ID;
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';

  const prevUrl = process.env['SUPABASE_URL'];
  const prevJwks = process.env['SUPABASE_JWKS_JSON'];

  const normalizedUrl = supabaseUrl.replace(/\/$/, '');
  const issuer = `${normalizedUrl}/auth/v1`;

  process.env['SUPABASE_URL'] = normalizedUrl;
  process.env['SUPABASE_JWKS_JSON'] = JSON.stringify({ keys: [publicJwk] });

  const signToken = async (options: SignTokenOptions = {}): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setIssuer(options.iss ?? issuer)
      .setAudience(options.aud ?? 'authenticated')
      .setIssuedAt(now)
      .setExpirationTime(options.exp ?? now + 3600);

    if (options.sub !== null) {
      jwt.setSubject(options.sub ?? '00000000-0000-4000-8000-000000000001');
    }

    return jwt.sign(privateKey);
  };

  const signWithWrongKey = async (sub: string): Promise<string> => {
    const { privateKey: wrongKey } = await generateKeyPair('ES256');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(sub)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(wrongKey);
  };

  const restore = (): void => {
    if (prevUrl === undefined) {
      delete process.env['SUPABASE_URL'];
    } else {
      process.env['SUPABASE_URL'] = prevUrl;
    }

    if (prevJwks === undefined) {
      delete process.env['SUPABASE_JWKS_JSON'];
    } else {
      process.env['SUPABASE_JWKS_JSON'] = prevJwks;
    }
  };

  return { supabaseUrl: normalizedUrl, issuer, signToken, signWithWrongKey, restore };
}
