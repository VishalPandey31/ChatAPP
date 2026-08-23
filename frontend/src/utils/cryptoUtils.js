// WebCrypto API Utility Functions for ECDH Key Exchange and AES-GCM Encryption

const EC_ALGO = { name: "ECDH", namedCurve: "P-256" };
const AES_ALGO = { name: "AES-GCM", length: 256 };

// Helper to convert ArrayBuffer to Base64
const bufferToBase64 = (buffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
};

// Helper to convert Base64 to ArrayBuffer
const base64ToBuffer = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

export const generateKeyPair = async () => {
    try {
        const keyPair = await window.crypto.subtle.generateKey(
            EC_ALGO,
            true, // extractable
            ["deriveKey", "deriveBits"]
        );
        return keyPair;
    } catch (e) {
        console.error("Error generating key pair:", e);
        return null;
    }
};

export const exportPublicKey = async (publicKey) => {
    try {
        const exported = await window.crypto.subtle.exportKey("spki", publicKey);
        return bufferToBase64(exported);
    } catch (e) {
        console.error("Error exporting public key:", e);
        return null;
    }
};

export const importPublicKey = async (spkiBase64) => {
    try {
        const buffer = base64ToBuffer(spkiBase64);
        return await window.crypto.subtle.importKey(
            "spki",
            buffer,
            EC_ALGO,
            true,
            []
        );
    } catch (e) {
        console.error("Error importing public key:", e);
        return null;
    }
};

export const deriveSecretKey = async (privateKey, remotePublicKey) => {
    try {
        return await window.crypto.subtle.deriveKey(
            {
                name: "ECDH",
                public: remotePublicKey
            },
            privateKey,
            AES_ALGO,
            false, // don't allow extracting the raw shared secret
            ["encrypt", "decrypt"]
        );
    } catch (e) {
        console.error("Error deriving secret key:", e);
        return null;
    }
};

export const encryptMessage = async (text, secretKey) => {
    try {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedText = new TextEncoder().encode(text);

        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            secretKey,
            encodedText
        );

        return {
            ciphertext: bufferToBase64(ciphertextBuffer),
            iv: bufferToBase64(iv.buffer)
        };
    } catch (e) {
        console.error("Encryption error:", e);
        return null;
    }
};

export const decryptMessage = async (ciphertextBase64, ivBase64, secretKey) => {
    try {
        const ciphertextBuffer = base64ToBuffer(ciphertextBase64);
        const ivBuffer = base64ToBuffer(ivBase64);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer },
            secretKey,
            ciphertextBuffer
        );

        return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
        // Not throwing to avoid complete UI crashes on bad payloads
        console.warn("Decryption error (might be wrong key or corrupted data):", e);
        return "[Unable to decrypt message]";
    }
};

// Store KeyPair securely (for simplicity using IndexedDB wrapped in Promises)
export const storeKeyPair = async (userId, keyPair) => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ChatAppCryptoDB", 1);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("keys")) {
                db.createObjectStore("keys", { keyPath: "userId" });
            }
        };

        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction("keys", "readwrite");
            const store = tx.objectStore("keys");
            store.put({ userId, ...keyPair });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        };

        request.onerror = () => reject(request.error);
    });
};

export const loadKeyPair = async (userId) => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ChatAppCryptoDB", 1);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("keys")) {
                db.createObjectStore("keys", { keyPath: "userId" });
            }
        };

        request.onsuccess = (e) => {
            const db = e.target.result;
            // Check if store exists in case DB was upgraded somewhere else
            if (!db.objectStoreNames.contains("keys")) {
                resolve(null);
                return;
            }
            const tx = db.transaction("keys", "readonly");
            const store = tx.objectStore("keys");
            const getReq = store.get(userId);

            getReq.onsuccess = () => {
                const data = getReq.result;
                if (data) {
                    resolve({ publicKey: data.publicKey, privateKey: data.privateKey });
                } else {
                    resolve(null);
                }
            };
            getReq.onerror = () => reject(getReq.error);
        };

        request.onerror = () => reject(request.error);
    });
};
