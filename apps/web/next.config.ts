import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship raw TS; let Next transpile them.
  transpilePackages: ['@hftr/contracts', '@hftr/db', '@hftr/engine', '@hftr/llm', '@hftr/adapters'],
};

export default nextConfig;
