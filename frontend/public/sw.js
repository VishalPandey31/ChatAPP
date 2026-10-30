self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(function (names) {
                return Promise.all(names.map(name => caches.delete(name)));
            })
        ])
    );
});

self.addEventListener('push', function (event) {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: "Swiggy", body: "Your order is arriving soon 🍔" };
    }

    const title = data.title || "Swiggy";
    const body = data.body || "Your order is arriving soon 🍔";
    const clickUrl = data.data && data.data.url ? data.data.url : '/';
    const projectId = (data.data && data.data.projectId) ? String(data.data.projectId) : 'chat';

    const options = {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'chat-proj-' + projectId, // Replaces previous notification rather than stacking infinitely
        renotify: true,
        data: { url: clickUrl }
    };

    // Suppress notification ONLY if the user is ACTIVELY viewing the chat window right now
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            let isUserActiveInChat = false;

            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // In mobile & desktop browsers: visibilityState === 'visible' means the screen is active & showing the app
                if (client.visibilityState === 'visible') {
                    try {
                        const clientUrl = new URL(client.url);
                        if (clientUrl.pathname === clickUrl || (clickUrl.startsWith('/chat/') && clientUrl.pathname.startsWith('/chat/'))) {
                            isUserActiveInChat = true;
                            break;
                        }
                    } catch (e) {
                        // ignore URL parse errors
                    }
                }
            }

            // If user is actively looking at the chat screen, do not show system notification
            if (isUserActiveInChat) {
                return Promise.resolve();
            }

            return self.registration.showNotification(title, options);
        })
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const data = event.notification.data || {};
    const clickUrl = data.url || '/';

    if (data.type === 'YOUTUBE_REDIRECT') {
        const allowedDomains = ['youtube.com', 'www.youtube.com', 'youtu.be'];
        try {
            const urlObj = new URL(clickUrl);
            if (allowedDomains.includes(urlObj.hostname) || clickUrl.includes('youtube.com')) {
                event.waitUntil(clients.openWindow(clickUrl));
            } else {
                console.error("Invalid YouTube URL domain.");
            }
        } catch (err) {
            console.error("Invalid URL format.");
        }
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Check if there is already a window/tab open with the target URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // Focus exact chat URL
                try {
                    if (new URL(client.url).pathname === clickUrl && 'focus' in client) {
                        return client.focus();
                    }
                } catch (e) { }
            }
            // Check if any window is open at all to navigate
            if (windowClients.length > 0) {
                const client = windowClients[0];
                return client.navigate(clickUrl).then(c => c.focus());
            }
            // If no windows are open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(clickUrl);
            }
        })
    );
});
