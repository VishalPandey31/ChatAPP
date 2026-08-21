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
    messageType: {
        type: String,
        enum: ['TEXT', 'IMAGE', 'VOICE'],
        default: 'TEXT'
    },
    status: {
        type: String,
        enum: ['SENT', 'DELIVERED', 'READ'],
        default: 'SENT'
    }
}, { timestamps: true });

export default mongoose.model('Message', messageSchema);
