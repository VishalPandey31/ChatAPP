import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        index: true
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    content: {
        type: String,
        required: true  // Stores plaintext for legacy, ciphertext (Base64) for E2EE messages
    },
    iv: {
        type: String,   // Base64 IV for AES-GCM (only present when encryptionVersion >= 1)
        default: null
    },
    encryptionVersion: {
        type: Number,   // 0 = legacy plaintext, 1 = AES-GCM E2EE
        default: 0
    },
    messageType: {
        type: String,
        enum: ['TEXT', 'IMAGE', 'VOICE', 'CALL_RECORD'],
        default: 'TEXT'
    },
    // Populated only when messageType === 'CALL_RECORD'
    callMeta: {
        callId: { type: String },
        status: {
            type: String,
            enum: ['completed', 'declined', 'missed', 'no_answer', 'failed', 'cancelled'],
        },
        duration: { type: Number, default: 0 }, // seconds
        callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    clientMessageId: {
        type: String,
        unique: true,
        sparse: true
    },
    edited: {
        type: Boolean,
        default: false
    },
    editedAt: {
        type: Date
    },
    deleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    },
    reactions: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reaction: String
    }],
    status: {
        type: String,
        enum: ['SENT', 'DELIVERED', 'READ'],
        default: 'SENT'
    }
}, { timestamps: true });

// Compound index for fast project message queries (covers sort + filter)
messageSchema.index({ projectId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ projectId: 1, sender: 1, status: 1 });

export default mongoose.model('Message', messageSchema);
