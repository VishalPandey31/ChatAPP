const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log("Push messaging is not supported in this browser.");
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // Wait till registration is active
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!publicVapidKey) {
                console.error("Vapid key missing in env");
                return false;
            }

            const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
        }

        // Post subscription to backend
        const res = await fetch(`${BACKEND_URL}/api/notifications/subscribe`, {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' // to send http-only cookie auth token
        });

        if (res.ok) {
            console.log("Push registered successfully.");
            return true;
        }
        return false;
    } catch (err) {
        console.error("Push Registration Error:", err);
        return false;
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function unsubscribeFromPushNotifications() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                console.log("Push unregistered successfully.");
            }
        } catch (err) {
            console.error("Push Unregister Error:", err);
        }
    }
}
