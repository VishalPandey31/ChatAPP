import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const messageSchema = new mongoose.Schema({
    sender: mongoose.Schema.Types.ObjectId,
    receiver: mongoose.Schema.Types.ObjectId,
    projectId: mongoose.Schema.Types.ObjectId,
    content: String,
    iv: String,
    encryptionVersion: Number,
    messageType: String,
    clientMessageId: String,
    deleted: Boolean,
    status: String
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const msgs = await Message.find().sort({ createdAt: -1 }).limit(10);
        console.log(JSON.stringify(msgs, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
