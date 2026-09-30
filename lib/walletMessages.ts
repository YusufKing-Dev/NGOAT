// Message strings a wallet is asked to sign. Kept free of Node-only
// imports so the browser and the server build the exact same text.

/** How long a "link my withdrawal wallet" signature stays valid. */
export const WITHDRAWAL_PROOF_MAX_AGE_MS = 5 * 60 * 1000;

/** How long a "deposit sender" signature stays valid (covers the time a tx takes to confirm). */
export const DEPOSIT_PROOF_MAX_AGE_MS = 15 * 60 * 1000;

export function withdrawalLinkMessage(userId: string, wallet: string, issuedAt: number): string {
  return [
    "NGOAT - link withdrawal wallet",
    "",
    "Signing this message proves you own this wallet.",
    "It costs nothing and does not move any funds.",
    "",
    `Account: ${userId}`,
    `Wallet: ${wallet}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

export function depositProofMessage(userId: string, wallet: string, issuedAt: number): string {
  return [
    "NGOAT - verify deposit wallet",
    "",
    "Signing this message proves the deposit is coming from your wallet.",
    "It costs nothing and does not move any funds.",
    "",
    `Account: ${userId}`,
    `Wallet: ${wallet}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

/** Browser helper: signature bytes -> base64 string for the API. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}