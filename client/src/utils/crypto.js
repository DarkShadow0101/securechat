import CryptoJS from 'crypto-js';

/**
 * Generates a consistent, shared secret key from a chat room ID.
 * We hash the chatRoomId to ensure the key has a fixed length for AES.
 * @param {string} chatRoomId - The unique identifier for the chat room.
 * @returns {string} The secret key for encryption/decryption.
 */
const getSecretKey = (chatRoomId) => {
  return CryptoJS.SHA256(chatRoomId).toString();
};

/**
 * Encrypts a given text message using AES encryption.
 * @param {string} text - The plain text message to encrypt.
 * @param {string} chatRoomId - The chat room ID, used to generate the secret key.
 * @returns {string} The encrypted ciphertext.
 */
export const encryptMessage = (text, chatRoomId) => {
  const secretKey = getSecretKey(chatRoomId);
  return CryptoJS.AES.encrypt(text, secretKey).toString();
};

/**
 * Decrypts a given ciphertext using AES encryption.
 * Includes error handling for messages that might not be encrypted (e.g., old messages).
 * @param {string} encryptedText - The ciphertext to decrypt.
 * @param {string} chatRoomId - The chat room ID, used to generate the secret key.
 * @returns {string} The original decrypted text or an error message.
 */
export const decryptMessage = (encryptedText, chatRoomId) => {
  try {
    const secretKey = getSecretKey(chatRoomId);
    const bytes = CryptoJS.AES.decrypt(encryptedText, secretKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    // If decryption results in an empty string, it might mean the key is wrong
    // or the data is corrupted. We return a placeholder.
    if (!originalText) {
        return "[Decryption Error]";
    }
    return originalText;
  } catch (error) {
    console.error("Decryption failed:", error);
    // This will be shown for old, unencrypted messages or if something goes wrong.
    return "[Message could not be decrypted]";
  }
};
