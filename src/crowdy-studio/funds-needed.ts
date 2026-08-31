/**
 * Copy for an empty player-compute wallet.
 *
 * Dest used to sanitise PLAYER_WALLET_EMPTY into PLATFORM_ERROR, so Studio
 * must also recognise a non-positive wallet / gated reason and say so here.
 */

export const FUNDS_NEEDED_HEADLINE =
  'Your compute wallet needs funds before this can run.';
export const FUNDS_NEEDED_DETAIL =
  'This is not a Studio or platform outage. Top up the player wallet, then invoke again.';

export interface FundsWalletSnapshot {
  balanceCents: string;
  currency?: string;
}

export interface FundsUsageSnapshot {
  gateReason?: string | null;
}

export function playerComputeNeedsFunds(input: {
  wallet?: FundsWalletSnapshot | null;
  usage?: FundsUsageSnapshot | null;
}): boolean {
  if (input.usage?.gateReason === 'PLAYER_WALLET_EMPTY') return true;
  const cents = Number(input.wallet?.balanceCents);
  return Number.isFinite(cents) && cents <= 0;
}

export function formatWalletNeedsFundsLabel(
  wallet: FundsWalletSnapshot,
): string {
  const amount = wallet.balanceCents.trim();
  const currency = (wallet.currency ?? 'usd').trim().toLowerCase();
  return `wallet ${amount} ${currency} · top up to run`;
}

export function isGenericPlatformInvokeError(error: string): boolean {
  return /PLATFORM_ERROR|something went wrong on our side/i.test(error);
}

export function isFundsRequiredInvokeError(error: string): boolean {
  return /FUNDS_REQUIRED|PLAYER_WALLET_EMPTY|wallet needs funds/i.test(error);
}

/** Rewrite a sanitised platform error when the live wallet is empty. */
export function explainInvokeFundsNeeded(
  error: string,
  input: {
    wallet?: FundsWalletSnapshot | null;
    usage?: FundsUsageSnapshot | null;
  },
): string | null {
  if (isFundsRequiredInvokeError(error)) {
    return [FUNDS_NEEDED_HEADLINE, FUNDS_NEEDED_DETAIL].join('\n');
  }
  if (playerComputeNeedsFunds(input) && isGenericPlatformInvokeError(error)) {
    return [FUNDS_NEEDED_HEADLINE, FUNDS_NEEDED_DETAIL].join('\n');
  }
  return null;
}
