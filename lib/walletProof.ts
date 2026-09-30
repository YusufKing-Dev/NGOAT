import { createPublicKey, verify } from "crypto";
import { PublicKey } from "@solana/web3.js";

// DER prefix that wraps a raw 32-byte Ed25519 public key into the SPKI
// format Node's crypto module expects. Using Node's built-in Ed25519
// support means no extra dependency is needed.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * True only if `signatureB64` is a valid Ed25519 signature of `message`
 * made by the private key behind the Solana address `address`. This is
 * what proves a person actually controls a wallet, as opposed to just
 * having typed or pasted its address.
 */
export function verifyWalletSignature(address: string, message: string, signatureB64: string): boolean {
  try {
    const publicKeyBytes = new PublicKey(address).toBytes();
    const signature = Buffer.from(signatureB64, "base64");
    if (signature.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(message, "utf8"), key, signature);
  } catch {
    return false;
  }
}