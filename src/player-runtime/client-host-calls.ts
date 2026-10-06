import { GENERATED_HOST_CATALOG } from './host-catalog.generated.js';

/**
 * Client calls in the platform catalog that only the legacy engines answered, besides the
 * Game Model group: crowdy-client-sdk does not wrap them, and nothing in the browser answers
 * them.
 */
const LEGACY_HOST_CALLS: ReadonlySet<string> = new Set([
  'sessions_list',
  'grid_state_get',
  'grid_state_set',
]);

/**
 * The host calls a ck-exec mod's CLIENT half may make, grouped by capability (04 §4): the
 * client half of the platform host catalog less what only the legacy engines answered (the
 * `model` group, `sessions_list` and `grid_state_*`). It is exactly what crowdy-client-sdk
 * wraps, and the broker's deny-by-default allowlist.
 */
export const EXEC_CLIENT_HOST_CALLS: Readonly<Record<string, ReadonlySet<string>>> = (() => {
  const groups: Record<string, Set<string>> = {};
  for (const fn of GENERATED_HOST_CATALOG.functions) {
    if (!fn.targets.includes('client') || fn.group === 'model' || LEGACY_HOST_CALLS.has(fn.name)) {
      continue;
    }
    (groups[fn.group] ??= new Set()).add(fn.name);
  }
  return groups;
})();
