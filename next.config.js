/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    config.externals = [...(config.externals || []), '@capacitor-community/background-geolocation'];
    return config;
  },
};

module.exports = nextConfig;
