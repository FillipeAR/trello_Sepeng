import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Action padrão aceita só 1MB de body — anexos (contrato, foto,
    // relatório) passam disso fácil. Sobe pro mesmo teto de scripts/actions.ts.
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [
      {
        // Sem isso, um CDN/navegador pode servir uma versão velha do service
        // worker por um bom tempo — quem atualiza o app fica preso na versão
        // de cache anterior.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
