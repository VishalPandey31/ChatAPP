import https from 'https';

const URL = 'https://chatapp-v6ug.onrender.com/api/health';
const INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

function ping() {
  const start = Date.now();
  https.get(URL, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`[${new Date().toLocaleTimeString()}] Ping OK (${res.statusCode}) in ${Date.now() - start}ms - ${body.trim()}`);
    });
  }).on('error', (err) => {
    console.error(`[${new Date().toLocaleTimeString()}] Ping failed:`, err.message);
  });
}

console.log(`Keep-alive daemon started for: ${URL}`);
ping(); // initial ping
setInterval(ping, INTERVAL_MS);
