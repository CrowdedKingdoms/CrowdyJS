/**
 * Small deterministic, hand-encoded WebAssembly corpus for the D13
 * client-sandbox suite.
 *
 * These are executable binary modules (not mocked GuestExports), but they do
 * NOT prove the production compiler/instrumentation pipeline. An env-gated
 * toolchain artifact test in player-client-security-d13.test.mjs owns that
 * separate claim.
 */

const encoder = new TextEncoder();
const I32 = 0x7f;
const I64 = 0x7e;

function u32(value) {
  const out = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining !== 0) byte |= 0x80;
    out.push(byte);
  } while (remaining !== 0);
  return out;
}

function s32(value) {
  const out = [];
  let remaining = value | 0;
  let more = true;
  while (more) {
    let byte = remaining & 0x7f;
    remaining >>= 7;
    const signSet = (byte & 0x40) !== 0;
    more = !(
      (remaining === 0 && !signSet) ||
      (remaining === -1 && signSet)
    );
    if (more) byte |= 0x80;
    out.push(byte);
  }
  return out;
}

function stringBytes(value) {
  const bytes = [...encoder.encode(value)];
  return [...u32(bytes.length), ...bytes];
}

function vector(entries) {
  return [...u32(entries.length), ...entries.flat()];
}

function section(id, payload) {
  return [id, ...u32(payload.length), ...payload];
}

function functionType(params, results) {
  return [0x60, ...vector(params.map((p) => [p])), ...vector(results.map((r) => [r]))];
}

function functionBody(instructions, locals = []) {
  const localDecls = locals.map(({ count, type }) => [...u32(count), type]);
  const body = [...vector(localDecls), ...instructions, 0x0b];
  return [...u32(body.length), ...body];
}

function exportEntry(name, kind, index) {
  return [...stringBytes(name), kind, ...u32(index)];
}

function binaryModule(sections) {
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...sections.flat(),
  ]);
}

export function makeHostCallArtifact({
  request,
  requestPtr = 64,
  callPtr = requestPtr,
  callLen,
  allocPtr = 2048,
}) {
  const requestBytes =
    typeof request === 'string'
      ? encoder.encode(request)
      : encoder.encode(JSON.stringify(request));
  const effectiveLen = callLen ?? requestBytes.length;
  const types = section(1, vector([
    functionType([I32, I32], [I64]),
    functionType([I32], [I32]),
    functionType([], []),
  ]));
  const imports = section(2, vector([
    [...stringBytes('ck'), ...stringBytes('host_call'), 0x00, ...u32(0)],
  ]));
  const functions = section(3, vector([[...u32(1)], [...u32(2)]]));
  const memory = section(5, vector([[0x00, ...u32(1)]]));
  const exports = section(7, vector([
    exportEntry('memory', 0x02, 0),
    exportEntry('ck_alloc', 0x00, 1),
    exportEntry('init', 0x00, 2),
  ]));
  const code = section(10, vector([
    functionBody([0x41, ...s32(allocPtr)]),
    functionBody([
      0x41, ...s32(callPtr),
      0x41, ...s32(effectiveLen),
      0x10, ...u32(0),
      0x1a,
    ]),
  ]));
  const data = section(11, vector([[
    0x00,
    0x41, ...s32(requestPtr), 0x0b,
    ...u32(requestBytes.length),
    ...requestBytes,
  ]]));
  return binaryModule([types, imports, functions, memory, exports, code, data]);
}

export function makeForbiddenImportArtifact(moduleName, importName) {
  const types = section(1, vector([functionType([], [])]));
  const imports = section(2, vector([[
    ...stringBytes(moduleName),
    ...stringBytes(importName),
    0x00,
    ...u32(0),
  ]]));
  return binaryModule([types, imports]);
}

export function makeSpinArtifact(iterations = 20_000_000) {
  const types = section(1, vector([
    functionType([I32], [I32]),
    functionType([I32], []),
  ]));
  const functions = section(3, vector([[...u32(0)], [...u32(1)]]));
  const memory = section(5, vector([[0x00, ...u32(1)]]));
  const exports = section(7, vector([
    exportEntry('memory', 0x02, 0),
    exportEntry('ck_alloc', 0x00, 0),
    exportEntry('tick', 0x00, 1),
  ]));
  const code = section(10, vector([
    functionBody([0x41, ...s32(1024)]),
    functionBody([
      0x41, ...s32(iterations),
      0x21, ...u32(1),
      0x02, 0x40,
      0x03, 0x40,
      0x20, ...u32(1),
      0x45,
      0x0d, ...u32(1),
      0x20, ...u32(1),
      0x41, ...s32(1),
      0x6b,
      0x21, ...u32(1),
      0x0c, ...u32(0),
      0x0b,
      0x0b,
    ], [{ count: 1, type: I32 }]),
  ]));
  return binaryModule([types, functions, memory, exports, code]);
}

/** A tick export that never returns: loop { br 0 }. */
export function makeInfiniteSpinArtifact() {
  const types = section(1, vector([
    functionType([I32], [I32]),
    functionType([I32], []),
  ]));
  const functions = section(3, vector([[...u32(0)], [...u32(1)]]));
  const memory = section(5, vector([[0x00, ...u32(1)]]));
  const exports = section(7, vector([
    exportEntry('memory', 0x02, 0),
    exportEntry('ck_alloc', 0x00, 0),
    exportEntry('tick', 0x00, 1),
  ]));
  const code = section(10, vector([
    functionBody([0x41, ...s32(1024)]),
    functionBody([
      0x03, 0x40,
      0x0c, ...u32(0),
      0x0b,
    ]),
  ]));
  return binaryModule([types, functions, memory, exports, code]);
}

/** A tick export that loops forever over a denied host call. */
export function makeMalformedHostCallLoopArtifact() {
  const requestPtr = 64;
  const requestBytes = encoder.encode(
    JSON.stringify({ fn: 'fetch', args: {} }),
  );
  const types = section(1, vector([
    functionType([I32, I32], [I64]),
    functionType([I32], [I32]),
    functionType([I32], []),
  ]));
  const imports = section(2, vector([
    [...stringBytes('ck'), ...stringBytes('host_call'), 0x00, ...u32(0)],
  ]));
  const functions = section(3, vector([[...u32(1)], [...u32(2)]]));
  const memory = section(5, vector([[0x00, ...u32(1)]]));
  const exports = section(7, vector([
    exportEntry('memory', 0x02, 0),
    exportEntry('ck_alloc', 0x00, 1),
    exportEntry('tick', 0x00, 2),
  ]));
  const code = section(10, vector([
    functionBody([0x41, ...s32(2048)]),
    functionBody([
      0x03, 0x40,
      0x41, ...s32(requestPtr),
      0x41, ...s32(requestBytes.length),
      0x10, ...u32(0),
      0x1a,
      0x0c, ...u32(0),
      0x0b,
    ]),
  ]));
  const data = section(11, vector([[
    0x00,
    0x41, ...s32(requestPtr), 0x0b,
    ...u32(requestBytes.length),
    ...requestBytes,
  ]]));
  return binaryModule([types, imports, functions, memory, exports, code, data]);
}

export const COMPILED_CLIENT_CORPUS = Object.freeze({
  benignRead: makeHostCallArtifact({
    request: { fn: 'actors_list', args: { x: 1, y: 1, z: 1 } },
  }),
  presentation: makeHostCallArtifact({
    request: {
      fn: 'hud_set',
      args: { payload: '<img src=x onerror=globalThis.pwned=1>' },
    },
  }),
  forgedBinding: makeHostCallArtifact({
    request: {
      fn: 'actors_list',
      args: { x: 1, y: 1, z: 1, bindingKind: 'studio' },
      bindingKind: 'studio',
    },
  }),
});
