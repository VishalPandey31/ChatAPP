/**
 * E2EE Crypto Utilities using WebCrypto API
 * - ECDH (P-256) for Key Agreement
 * - AES-GCM (256-bit) for Authenticated Encryption
 */

/**
 * Generate an ECDH KeyPair for the user on their device.
 * Private key remains non-exportable where possible (though for demo we might need to store in IDB or local storage, ideally protected).
 */
export async function generateKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true, // extractable (needed to store locally or export public key)
        ["deriveKey"]
    );
    return keyPair;
}

/**
 * Export the Public Key to a JWK string to send to the server.
 */
export async function exportPublicKey(publicKey) {
    const exported = await window.crypto.subtle.exportKey("jwk", publicKey);
    return JSON.stringify(exported);
}

/**
 * Import a Public Key JWK string from the server.
 */
export async function importPublicKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        []
    );
}

/**
 * Export Private Key to store locally (e.g. IndexedDB/LocalStorage).
 * In production this should ideally be wrapped/encrypted by a user password.
 */
export async function exportPrivateKey(privateKey) {
    const exported = await window.crypto.subtle.exportKey("jwk", privateKey);
    return JSON.stringify(exported);
}

/**
 * Import Private Key from local storage.
 */
export async function importPrivateKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey"]
    );
}

/**
 * Derive a shared AES-GCM secret using my Private Key + their Public Key.
 */
export async function deriveSharedSecret(myPrivateKey, theirPublicKey) {
    return await window.crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: theirPublicKey
        },
        myPrivateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false, // not exportable
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypt a plaintext string using the shared AES-GCM key.
 * Returns { ciphertext: Base64, iv: Base64 }
 */
export async function encryptMessage(text, sharedKey) {
    const enc = new TextEncoder();
    const encodedText = enc.encode(text);

    // Generate a random 96-bit IV for AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        sharedKey,
        encodedText
    );

    // Convert buffers to Base64
    const ciphertextBase64 = bufferToBase64(cipherBuffer);
    const ivBase64 = bufferToBase64(iv);

    return {
        ciphertext: ciphertextBase64,
        iv: ivBase64
    };
}

/**
 * Decrypt a Base64 ciphertext using the shared AES-GCM key and IV.
 */
export async function decryptMessage(ciphertextBase64, ivBase64, sharedKey) {
    const cipherBuffer = base64ToBuffer(ciphertextBase64);
    const iv = new Uint8Array(base64ToBuffer(ivBase64));

    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            sharedKey,
            cipherBuffer
        );
        const dec = new TextDecoder();
        return dec.decode(decryptedBuffer);
    } catch (e) {
        console.error("Decryption failed. Signature mismatch or wrong key.", e);
        throw new Error("Unable to decrypt message");
    }
}

// Helpers
export function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function base64ToBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
