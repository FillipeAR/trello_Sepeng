import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Action padrão aceita só 1MB de body — anexos (contrato, foto,
    // relatório) passam disso fácil. Sobe pro mesmo teto de scripts/actions.ts.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
