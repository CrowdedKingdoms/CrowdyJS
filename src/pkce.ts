/**
 * PKCE (RFC 7636) helpers for the Overworld portal handoff. The destination
 * game (a public browser client) generates a verifier+challenge; the challenge
 * travels to the Overworld identity origin which mints a one-time code; the game
 * exchanges the code with the verifier. The verifier never leaves the game's
 * origin, so an intercepted code can't be redeemed.
 *
 * Uses WebCrypto + base64url, available in browsers and Node 18+.
 */

const g = globalThis as unknown as {
  crypto?: Crypto;
  btoa?: (s: string) => string;
};

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = g.btoa
    ? g.btoa(binary)
    : // Node fallback when btoa isn't a global.
      Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  if (!g.crypto?.getRandomValues) {
    throw new Error('WebCrypto (crypto.getRandomValues) is required for PKCE');
  }
  g.crypto.getRandomValues(arr);
  return arr;
}

async function sha256(input: string): Promise<Uint8Array> {
  if (!g.crypto?.subtle) {
    throw new Error('WebCrypto (crypto.subtle) is required for PKCE');
  }
  const data = new TextEncoder().encode(input);
  const digest = await g.crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

/** Generate a fresh PKCE verifier + S256 challenge. */
export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(await sha256(verifier));
  return { verifier, challenge, method: 'S256' };
}

/** Opaque random state for CSRF-binding the redirect round-trip. */
export function generateState(): string {
  return base64url(randomBytes(16));
}
