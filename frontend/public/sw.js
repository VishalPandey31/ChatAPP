self.addEventListener('push', function (event) {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: "ChatApp", body: "New encrypted message" };
    }

    const title = data.title || "ChatApp Notification";
    const body = data.body || "New encrypted message";
    const clickUrl = data.data && data.data.url ? data.data.url : '/';

    const options = {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: { url: clickUrl }
    };

    // Prevent notification if the user is ALREADY LOOKING at the same chat!
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            let isFocusedOnSameChat = false;

            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.focused && client.visibilityState === 'visible') {
                    // Check if current URL matches the push payload target url
                    try {
                        const clientUrl = new URL(client.url);
                        if (clientUrl.pathname === clickUrl) {
                            isFocusedOnSameChat = true;
                            break;
                        }
                    } catch (e) {
                        // ignore URL parse errors
                    }
                }
            }

            if (isFocusedOnSameChat) {
                // Return gracefully without throwing a notification
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
