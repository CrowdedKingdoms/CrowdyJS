import { CrowdyError } from '../errors.js';
import type {
  ExecAPI,
  ExecBuild,
  ExecCrate,
  ExecManifestType,
  ExecNodeTypeInput,
  ExecStarterPack,
} from '../domains/exec.js';

/** The crates one build takes at most (the game API's `execBuild`). */
export const KIT_BUILD_MAX_CRATES = 16;

/** The node API scopes a manifest may declare (ck-exec `bounds::NODE_API_SCOPES`). */
export const KIT_NODE_API_SCOPES: readonly string[] = [
  'players.read',
  'players.write',
  'world.read',
  'world.write',
  'grids.read',
  'permissions.write',
  'grids.write',
  'access.read',
  'access.write',
];

/** A manifest as the kit composes it: the root hub and each node type. */
export interface KitManifest {
  root: string;
  types: Record<string, ExecNodeTypeInput | ExecManifestType>;
}

/** What {@link KitTopology.plan} composes: a manifest, and the starter crates it builds. */
export interface KitTopologyPlan {
  root: string;
  types: Record<string, ExecNodeTypeInput>;
  /** The starter crates the types name, each built once. */
  crates: string[];
}

/** Changes to a planned type: a seed, limits, replicas, scopes, `client`, ... */
export interface KitPlanOptions {
  overrides?: Record<string, Partial<ExecNodeTypeInput>>;
}

/** How {@link KitTopology.deploy} waits for its build. */
export interface KitDeployOptions {
  /** Default 10 minutes. */
  timeoutMs?: number;
  /** Called with the build once it is done. */
  onBuild?: (build: ExecBuild) => void;
}

const NAME = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * What the execution manager would refuse in `manifest`, in its words (ck-exec
 * `Manifest::problems`, less the digests, which the build fills in): the root is a hub
 * without a parent, every other type has a defined parent, `calls` name defined types or `*`,
 * replicas are for spokes, scopes are known. Empty when it deploys.
 */
export function kitManifestProblems(manifest: KitManifest): string[] {
  const out: string[] = [];
  const types = manifest.types;
  const root = types[manifest.root];
  if (!root) out.push(`root type \`${manifest.root}\` is not defined`);
  else if (root.kind !== 'hub') out.push('the root type must be a hub');
  else if (root.parent) out.push('the root type has no parent');
  for (const [name, t] of Object.entries(types)) {
    if (!NAME.test(name)) out.push(`type name \`${name}\` must be 1-64 letters, digits, \`-\` or \`_\``);
    if (name !== manifest.root) {
      if (!t.parent) out.push(`\`${name}\` needs a parent`);
      else if (!types[t.parent]) out.push(`\`${name}\`: parent \`${t.parent}\` is not defined`);
    }
    for (const c of t.calls ?? []) {
      if (c !== '*' && !types[c]) out.push(`\`${name}\` calls \`${c}\`, which is not defined`);
    }
    if (t.kind === 'hub' && (t.replicas !== undefined || t.max_replicas !== undefined || t.concurrency !== undefined)) {
      out.push(`\`${name}\`: replicas, max_replicas and concurrency are for spokes`);
    }
    for (const s of (t.scopes as string[] | undefined) ?? []) {
      if (!KIT_NODE_API_SCOPES.includes(s)) {
        out.push(`\`${name}\`: unknown node API scope \`${s}\` (allowed: ${KIT_NODE_API_SCOPES.join(', ')})`);
      }
    }
  }
  return out;
}

/**
 * An app's tree of kit hubs, composed from the starter packs (`exec.starters`): pick the node
 * types a game uses, and {@link plan} adds the hubs they hang under and the ones they call,
 * checks the tree, and {@link deploy} builds the crates on the platform and deploys them.
 * For the app's developers (the org's `manage_compute`), from an identity session.
 */
export class KitTopology {
  private packed: Promise<ExecStarterPack> | null = null;

  constructor(
    private readonly appId: string,
    private readonly exec: ExecAPI | undefined,
  ) {}

  private api(): ExecAPI {
    if (!this.exec) throw new CrowdyError({ message: 'the kit has no exec client' });
    return this.exec;
  }

  /** The starter packs this tier's toolchain carries (fetched once). */
  pack(): Promise<ExecStarterPack> {
    if (!this.packed) {
      this.packed = this.api()
        .starters(this.appId)
        .catch((e) => {
          this.packed = null;
          throw e;
        });
    }
    return this.packed;
  }

  /** The node types the packs offer. */
  async types(): Promise<string[]> {
    return Object.keys((await this.pack()).manifest.types);
  }

  /**
   * A manifest with the types in `select`, the types they hang under up to the root, and the
   * types they call (by name, not `*`), from the packs' manifest.
   * @throws {CrowdyError} for a type the packs do not have, a tree the manager would refuse,
   *   or more crates than one build takes.
   */
  async plan(select: readonly string[], options: KitPlanOptions = {}): Promise<KitTopologyPlan> {
    const pack = await this.pack();
    const all = pack.manifest.types;
    const chosen = new Set<string>();
    const add = (name: string) => {
      if (chosen.has(name)) return;
      const t = all[name];
      if (!t) throw new CrowdyError({ message: `the starter packs have no node type '${name}' (they have ${Object.keys(all).join(', ')})` });
      chosen.add(name);
      if (t.parent) add(t.parent);
      for (const c of t.calls ?? []) if (c !== '*') add(c);
    };
    add(pack.manifest.root);
    for (const name of select) add(name);
    const types: Record<string, ExecNodeTypeInput> = {};
    for (const name of chosen) {
      const merged = { ...all[name], ...(options.overrides?.[name] ?? {}) } as ExecNodeTypeInput;
      // A type calls only what the plan holds.
      if (merged.calls) merged.calls = merged.calls.filter((c) => c === '*' || chosen.has(c));
      types[name] = merged;
    }
    const problems = kitManifestProblems({ root: pack.manifest.root, types });
    if (problems.length) throw new CrowdyError({ message: `the composed manifest would be refused: ${problems.join('; ')}` });
    const crates = [...new Set(Object.values(types).map((t) => t.crate).filter((c): c is string => typeof c === 'string'))];
    if (crates.length > KIT_BUILD_MAX_CRATES) {
      throw new CrowdyError({ message: `${crates.length} crates are more than one build takes (${KIT_BUILD_MAX_CRATES})` });
    }
    return { root: pack.manifest.root, types, crates };
  }

  /**
   * Builds the plan's crates on the platform, waits, and deploys the manifest with the build.
   * Resolves with the deployed version and the build id.
   * @throws {CrowdyError} when the build fails (its log in the message).
   */
  async deploy(plan: KitTopologyPlan, options: KitDeployOptions = {}): Promise<{ version: number; buildId: string }> {
    const pack = await this.pack();
    const crates: ExecCrate[] = plan.crates.map((name) => {
      const s = pack.starters.find((x) => x.crate === name);
      if (!s) throw new CrowdyError({ message: `the starter packs have no crate '${name}'` });
      return { name, files: s.files };
    });
    const exec = this.api();
    const queued = await exec.build(this.appId, crates);
    const done = await exec.waitForBuild(this.appId, queued.buildId, { timeoutMs: options.timeoutMs });
    options.onBuild?.(done);
    if (done.status !== 'succeeded') {
      throw new CrowdyError({ message: `build ${done.buildId} ${done.status}: ${(done.log ?? '').slice(-2_000)}` });
    }
    const { version } = await exec.deploy({ appId: this.appId, root: plan.root, types: plan.types, buildId: done.buildId });
    return { version, buildId: done.buildId };
  }
}
