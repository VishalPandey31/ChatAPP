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
    }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
