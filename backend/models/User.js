import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: false
    },
    role: {
        type: String,
        enum: ['ADMIN', 'USER'],
        default: 'USER'
    },
    approvalStatus: {
        type: String,
        enum: ['PENDING', 'APPROVED'],
        default: 'PENDING'
    },
    accountStatus: {
        type: String,
        enum: ['ACTIVE', 'REMOVED'],
        default: 'ACTIVE'
    },
    profilePicture: {
        type: String,
        default: ''
    },
    about: {
        type: String,
        default: ''
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    pushSubscriptions: {
        type: Array, // Array of { endpoint, keys: { p256dh, auth } }
        default: []
    },
    publicKey: {
        type: String, // Legacy unversioned E2EE Public Key (JWK JSON string)
        default: null
    },
    publicKeys: {
        type: [{
            keyId: { type: String, required: true },
            publicKey: { type: String, required: true },
            createdAt: { type: Date, default: Date.now }
        }],
        default: []
    },
    encryptedKeyRing: {
        type: String, // Base64 ciphertext of the user's Private Key Ring
        default: null
    },
    encryptedKeyRingIv: {
        type: String, // IV used to encrypt the Key Ring
        default: null
    }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
