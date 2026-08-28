import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import './models/User.js'; // Register User schema
dotenv.config();

const User = mongoose.model('User');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const email = "testadmin@gmail.com";

        // Remove existing
        await User.deleteMany({ email });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash("password123", salt);

        await User.create({
            email,
            password: hashedPassword,
            role: 'ADMIN',
            approvalStatus: 'APPROVED',
            accountStatus: 'ACTIVE'
        });

        console.log("Successfully created test admin with email: testadmin@gmail.com, password: password123");
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
