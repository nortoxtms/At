/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloud Run runs the standalone server (apps/web/Dockerfile): Next traces
  // exactly the files the build needs, so the image carries the server and
  // its dependencies rather than the whole pnpm workspace.
  output: 'standalone',
  // The trace has to start at the repo root, or a monorepo build silently
  // omits the workspace packages it linked to.
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  // shared-types ships TypeScript source; Next compiles it with the app so
  // web and mobile consume the same files without a build step.
  transpilePackages: ['@only-horses/shared-types'],
  images: {
    // §10: images are delivered through Cloudflare Images.
    remotePatterns: [{ protocol: 'https', hostname: 'imagedelivery.net' }],
  },
  webpack: (config) => {
    // shared-types is compiled by the API under NodeNext, which requires
    // explicit .js specifiers on relative imports. Teach the bundler to
    // resolve those back to the TypeScript sources so one package can serve
    // both consumers.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
module.exports = nextConfig;
