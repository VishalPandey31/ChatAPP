const fs = require('fs');
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();

try {
    fs.appendFileSync('.env', `\n# Web Push\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`);
} catch (e) {
    fs.writeFileSync('.env', `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`);
}

try {
    fs.appendFileSync('../frontend/.env', `\n# Web Push\nVITE_VAPID_PUBLIC_KEY=${keys.publicKey}\n`);
} catch (e) {
    fs.writeFileSync('../frontend/.env', `VITE_VAPID_PUBLIC_KEY=${keys.publicKey}\n`);
}
console.log('Keys generated and bound securely!');
