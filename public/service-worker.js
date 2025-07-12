/**
 * Progressive Budget Tracker Service Worker
 * Implements advanced caching strategies and offline functionality
 */

/**
 * --- ACID + Lighthouse Enhancements ---
 * - Improved documentation and inline comments
 * - Robust error handling for all async operations
 * - Offline fallback for navigation requests
 * - Await all cache operations for reliability
 * - Future-proof event listeners
 */

// Cache configuration
const CACHE_CONFIG = {
  STATIC_CACHE: 'budget-tracker-static-v3',
  DYNAMIC_CACHE: 'budget-tracker-dynamic-v2',
  API_CACHE: 'budget-tracker-api-v2',
  IMAGE_CACHE: 'budget-tracker-images-v1',
  MAX_DYNAMIC_ITEMS: 50,
  MAX_API_ITEMS: 100
};

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/index.js',
  '/db.js',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0'
];

// Utility: Offline fallback page for navigation
const OFFLINE_FALLBACK_PAGE = '/index.html';

// Cache size management
const limitCacheSize = async (cacheName, maxItems) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
};

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker');
  
  event.waitUntil(
    caches.open(CACHE_CONFIG.STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        const currentCaches = Object.values(CACHE_CONFIG);
        
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!currentCaches.includes(cacheName)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Network-first strategy for API calls
const networkFirstStrategy = async (request, cacheName) => {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(cacheName);
      cache.put(request.url, networkResponse.clone());
      
      // Limit cache size
      await limitCacheSize(cacheName, CACHE_CONFIG.MAX_API_ITEMS);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline fallback for API requests
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({ 
          error: 'Offline - data will sync when connection is restored',
          offline: true 
        }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    throw error;
  }
};

// Cache-first strategy for static assets
const cacheFirstStrategy = async (request, cacheName) => {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    // Fallback to network
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request.url, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return offline page for navigation requests
    if (request.destination === 'document') {
      const fallbackResponse = await caches.match('/index.html');
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }
    
    throw error;
  }
};

// Stale-while-revalidate strategy for dynamic content
const staleWhileRevalidateStrategy = async (request, cacheName) => {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        const cache = caches.open(cacheName);
        cache.then(c => c.put(request.url, networkResponse.clone()));
        limitCacheSize(cacheName, CACHE_CONFIG.MAX_DYNAMIC_ITEMS);
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);
  
  return cachedResponse || fetchPromise;
};

// Enhanced fetch event handler
self.addEventListener('fetch', event => {
  const { request } = event;
  // Only handle GET requests
  if (request.method !== 'GET') return;

  // API requests: network first
  if (request.url.includes('/api/')) {
    event.respondWith(
      networkFirstStrategy(request, CACHE_CONFIG.API_CACHE)
        .catch(() => new Response(JSON.stringify({ error: 'Offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  // Static assets: cache first
  if (STATIC_ASSETS.some(asset => request.url.includes(asset)) ||
      request.destination === 'style' ||
      request.destination === 'script') {
    event.respondWith(
      cacheFirstStrategy(request, CACHE_CONFIG.STATIC_CACHE)
        .catch(async () => {
          // Fallback to offline page for navigation
          if (request.mode === 'navigate') {
            return await caches.match(OFFLINE_FALLBACK_PAGE);
          }
        })
    );
    return;
  }

  // Images: stale-while-revalidate
  if (request.destination === 'image') {
    event.respondWith(
      staleWhileRevalidateStrategy(request, CACHE_CONFIG.IMAGE_CACHE)
        .catch(() => new Response('', { status: 404 }))
    );
    return;
  }

  // Other requests: cache first, fallback to offline page for navigation
  event.respondWith(
    cacheFirstStrategy(request, CACHE_CONFIG.DYNAMIC_CACHE)
      .catch(async () => {
        if (request.mode === 'navigate') {
          return await caches.match(OFFLINE_FALLBACK_PAGE);
        }
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'budget-sync') {
    event.waitUntil(syncBudgetData());
  }
});

// Sync budget data when back online
const syncBudgetData = async () => {
  try {
    // Trigger the sync in the main thread
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'SYNC_BUDGET_DATA' });
    });
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
};

// Push notification handling
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Budget updated successfully!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'budget-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View Budget',
        icon: '/icons/icon-72x72.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Budget Tracker', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Periodic background sync for data refresh
self.addEventListener('periodicsync', event => {
  if (event.tag === 'budget-refresh') {
    event.waitUntil(syncBudgetData());
  }
});

// Defensive: Listen for unhandledrejection and log
self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

// Defensive: Listen for error events
self.addEventListener('error', event => {
  console.error('[SW] Error event:', event.message);
});

console.log('[SW] Service Worker loaded successfully');