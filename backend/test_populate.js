import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        const Message = (await import('./models/Message.js')).default;
        const msg = await Message.findOne({ replyTo: { $exists: true, $ne: null } })
            .populate({ path: 'replyTo', select: 'content sender iv encryptionVersion messageType deleted' })
            .lean();
        console.log(JSON.stringify(msg.replyTo, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
