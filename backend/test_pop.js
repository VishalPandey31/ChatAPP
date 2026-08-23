import mongoose from 'mongoose';

mongoose.connect('mongodb+srv://vishalpandey000090_db_user:I4IuP2I0YhZkDgY7@cluster0.drjv5v8.mongodb.net/?appName=Cluster0')
    .then(async () => {
        const Message = (await import('./models/Message.js')).default;
        const msg = await Message.findOne({ replyTo: { $exists: true, $ne: null } })
            .populate({ path: 'replyTo', select: 'content sender iv encryptionVersion messageType deleted' })
            .lean();
        console.log("POPULATED REPLY:", JSON.stringify(msg.replyTo, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
