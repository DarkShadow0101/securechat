// client/src/services/encryptionService.js
import CryptoJS from "crypto-js";

/**
 * Deterministic shared secret derived from two UIDs.
 * WARNING: This is used ONLY for optional signaling payload encryption (SDP/ICE).
 * It is NOT a secure key-exchange for true E2E voice encryption.
 */
export const getSharedSecret = (uid1, uid2) => {
  if (typeof uid1 !== "string" || typeof uid2 !== "string" || !uid1 || !uid2) {
    throw new Error("Invalid UIDs for key generation");
  }
  const trimmed = [uid1.trim(), uid2.trim()].sort().join("");
  return CryptoJS.SHA256(trimmed).toString(CryptoJS.enc.Hex);
};

export const encryptMessage = (plainText, currentUserUid, otherUserUid) => {
  const secret = getSharedSecret(currentUserUid, otherUserUid);
  return CryptoJS.AES.encrypt(plainText, secret).toString();
};

export const decryptMessage = (cipherText, currentUserUid, otherUserUid) => {
  const secret = getSharedSecret(currentUserUid, otherUserUid);
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, secret);
    const result = bytes.toString(CryptoJS.enc.Utf8);
    if (!result) throw new Error("Empty result");
    return result;
  } catch (e) {
    console.error("Decrypt failed:", e);
    return "";
  }
};

export default { getSharedSecret, encryptMessage, decryptMessage };
