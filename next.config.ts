import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Expose Supabase env to client (browser) so auth and data work without NEXT_PUBLIC_ prefix
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
