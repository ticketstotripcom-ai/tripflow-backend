module.exports = {
  globDirectory: "dist/",
  globPatterns: ["**/*.{js,css,html,png,svg,ico,webp,avif,woff2}"],
  swDest: "dist/service-worker.js",
  importScripts: ["sw-extra.js"],
  runtimeCaching: [
    // App shell and static assets
    {
      urlPattern: ({request}) => request.destination === 'style' || request.destination === 'script' || request.destination === 'image' || request.destination === 'font',
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // API/data: Google Sheets proxy/backend
    {
      urlPattern: ({url}) => /onrender\.com|googleapis\.com|google\.com/.test(url.host),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
      },
    },
    // Fallback for everything else
    {
      urlPattern: /.*/,
      handler: 'NetworkFirst',
      options: { cacheName: 'dynamic-content', expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 } },
    },
  ],
};
