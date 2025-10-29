import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Add experimental config to allow cross-origin requests in dev mode
  experimental: {
    allowedDevOrigins: [
      'https://6000-firebase-studio-1761489309411.cluster-nle52mxuvfhlkrzyrq6g2cwb52.cloudworkstations.dev',
    ],
  },
   webpack(config, { isServer }) {
    // Add a rule to handle wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    if (!isServer) {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            "fs": false,
            "path": false,
            "crypto": false,
        };
    }
    
    // Set up headers for SharedArrayBuffer
    config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };

    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
