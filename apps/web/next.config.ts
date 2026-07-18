import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship raw TS; let Next transpile them.
  transpilePackages: ['@hftr/contracts', '@hftr/db', '@hftr/engine', '@hftr/llm', '@hftr/adapters'],
  // Belt-and-suspenders: include seed catalogs if any residual fs readers remain.
  outputFileTracingIncludes: {
    '/api/**/*': ['../../packages/db/src/seed/catalogs/**/*'],
  },
};

export default nextConfig;
