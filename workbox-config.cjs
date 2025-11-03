module.exports = {
  globDirectory: "dist/",
  globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
  swDest: "dist/service-worker.js",
  runtimeCaching: [{
    urlPattern: /.*/, 
    handler: 'NetworkFirst',
    options: {
      cacheName: 'dynamic-content',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      },
    },
  }],
};