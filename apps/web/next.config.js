/**
 * Two build targets from one app.
 *
 *  · default — `output: 'standalone'`, the Cloud Run image (apps/web/Dockerfile).
 *  · STATIC_PREVIEW=1 — `output: 'export'`, a static preview for GitHub Pages.
 *
 * The preview exists so the design system, the copy and the §24.26 policy
 * pages can be looked at without standing up an API. The marketplace pages
 * still build — they render their empty states, because `lib/api.ts` treats an
 * unreachable API as "no results" rather than as a crash. What the preview
 * cannot show is live data, and it says so in a banner rather than pretending.
 */
const isPreview = process.env.STATIC_PREVIEW === '1';

/** GitHub Pages serves a project site under /<repo>. */
const basePath = process.env.PAGES_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isPreview
    ? {
        output: 'export',
        basePath,
        assetPrefix: basePath || undefined,
        // Pages has no image optimizer behind it.
        images: { unoptimized: true },
        // Pages serves /path/ as /path/index.html.
        trailingSlash: true,
      }
    : {}),
  // Cloud Run runs the standalone server (apps/web/Dockerfile): Next traces
  // exactly the files the build needs, so the image carries the server and
  // its dependencies rather than the whole pnpm workspace.
  ...(isPreview ? {} : { output: 'standalone' }),
  // The trace has to start at the repo root, or a monorepo build silently
  // omits the workspace packages it linked to.
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  // shared-types ships TypeScript source; Next compiles it with the app so
  // web and mobile consume the same files without a build step.
  transpilePackages: ['@only-horses/shared-types'],
  ...(isPreview
    ? {}
    : {
        images: {
          // §10: images are delivered through Cloudflare Images.
          remotePatterns: [{ protocol: 'https', hostname: 'imagedelivery.net' }],
        },
      }),
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
