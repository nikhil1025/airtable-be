import crypto from "crypto";
import config from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;

/**
 * Derives a key from the encryption key using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    config.encryption.key,
    salt,
    100000,
    KEY_LENGTH,
    "sha512"
  );
}

/**
 * Encrypts text using AES-256-GCM
 * @param text - The text to encrypt
 * @returns Encrypted text in format: salt:iv:tag:encryptedData (all hex encoded)
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error("Text to encrypt cannot be empty");
  }

  if (config.encryption.key.length < 32) {
    throw new Error("Encryption key must be at least 32 characters long");
  }

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key from password and salt
  const key = deriveKey(salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt the text
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Get the auth tag
  const tag = cipher.getAuthTag();

  // Return salt:iv:tag:encrypted (all in hex)
  return `${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString(
    "hex"
  )}:${encrypted}`;
}

/**
 * Decrypts text encrypted with the encrypt function
 * @param encryptedText - The encrypted text in format: salt:iv:tag:encryptedData
 * @returns Decrypted text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    throw new Error("Encrypted text cannot be empty");
  }

  if (config.encryption.key.length < 32) {
    throw new Error("Encryption key must be at least 32 characters long");
  }

  try {
    // Split the encrypted text into its components
    const parts = encryptedText.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted text format");
    }

    const salt = Buffer.from(parts[0], "hex");
    const iv = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const encrypted = parts[3];

    // Derive the same key
    const key = deriveKey(salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    // Decrypt the text
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Checks if text is encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(":");
  return parts.length === 4;
}

export default {
  encrypt,
  decrypt,
  isEncrypted,
};
