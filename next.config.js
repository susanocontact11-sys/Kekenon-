/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [
        ...externals,
        {
          '@capacitor-community/background-geolocation':
            'commonjs @capacitor-community/background-geolocation',
        },
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
