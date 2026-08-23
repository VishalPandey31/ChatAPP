import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    content: {
        type: String,
        required: true
    },
    iv: {
        type: String, // Initialization Vector (Base64) for E2EE
    },
    encryptionVersion: {
        type: Number, // Example: 1 for AES-GCM
        default: 0 // 0 means unencrypted legacy plaintext
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

export default mongoose.model('Message', messageSchema);

