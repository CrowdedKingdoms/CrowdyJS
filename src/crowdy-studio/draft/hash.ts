/**
 * Git blob ids. A draft file's version is the SHA-1 git computes for it
 * (`blob <bytes>\0<content>`), so an unchanged file in the draft carries the
 * same id as its blob on GitHub, and "dirty" is a string comparison.
 */

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Git blob SHA-1 of raw bytes. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = encoder.encode(`blob ${bytes.byteLength}\0`);
  const buffer = new Uint8Array(header.byteLength + bytes.byteLength);
  buffer.set(header, 0);
  buffer.set(bytes, header.byteLength);
  return hex(await globalThis.crypto.subtle.digest('SHA-1', buffer));
}

/** Git blob SHA-1 of UTF-8 text. */
export function gitBlobShaOfText(text: string): Promise<string> {
  return gitBlobSha(encoder.encode(text));
}

/** UTF-8 byte length of text. */
export function utf8Length(text: string): number {
  return encoder.encode(text).byteLength;
}
