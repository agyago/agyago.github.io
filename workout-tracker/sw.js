/**
 * Service Worker for Workout Tracker
 * Enables offline functionality
 */

const CACHE_NAME = 'workout-tracker-v1';
const STATIC_ASSETS = [
    '/workout-tracker.html',
    '/css/workout-tracker.css',
    '/js/workout-tracker.js',
    '/workout-tracker/manifest.json'
];

const EXTERNAL_ASSETS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(STATIC_ASSETS)
                    .then(() => {
                        return Promise.allSettled(
                            EXTERNAL_ASSETS.map(url => 
                                cache.add(url).catch(() => console.log('Failed to cache:', url))
                            )
                        );
                    });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => {
                return Promise.all(
                    names
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    
    // Skip auth endpoints - always go to network
    if (url.pathname.startsWith('/api/auth')) {
        return;
    }

    // For external resources (CDN)
    const isExternal = url.origin !== self.location.origin;
    const isAllowedExternal = isExternal && url.hostname === 'cdn.jsdelivr.net';

    if (isExternal && !isAllowedExternal) return;

    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                if (cached) return cached;

                return fetch(event.request)
                    .then((response) => {
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(event.request, responseToCache));

                        return response;
                    })
                    .catch(() => {
                        if (event.request.mode === 'navigate') {
                            return caches.match('/workout-tracker.html');
                        }
                    });
            })
    );
});
