/** @type {import('next').NextConfig} */
const nextConfig = {
images: {
remotePatterns: [
{ protocol: 'https', hostname: 'commons.wikimedia.org' },
{ protocol: 'https', hostname: '**.wikimedia.org' },
],
},
// The local SQLite scraper DB lives in ./data- never rebuild/HMR because
// a scrape wrote to it (that was a constant source of dev-server churn).
webpack: (config, { dev }) => {
if (dev) {
config.watchOptions = {
...config.watchOptions,
ignored: ['**/node_modules/**', '**/.git/**', '**/data/**', '**/.next/**'],
};
}
return config;
},
};
module.exports = nextConfig;