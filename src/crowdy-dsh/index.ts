/**
 * Crowdy Studio agent pane: the DeepSeek Harness running in the player's
 * browser, embedded beside the Studio editor and bridged to it.
 *
 * @module @crowdedkingdoms/crowdyjs/crowdy-dsh
 */

export {
  StudioDshBridge,
  renderSettingsYaml,
  type CrowdyStudioDshHost,
  type StudioDshBridgeOptions,
  type StudioDshBridgeStatus,
} from './bridge.js';
export { CrowdyStudioDshPane, CROWDY_STUDIO_DSH_STYLES, type CrowdyStudioDshPaneOptions } from './pane.js';
export {
  CrowdyStudioDshTransport,
  type CrowdyStudioModelCatalogEntry,
  type CrowdyStudioModelUsage,
  type CrowdyStudioModelUsageEntry,
  type CrowdyStudioProviderConsent,
} from './transport.js';
export * from './protocol.js';
