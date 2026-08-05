import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ObraFlow — Gestão Operacional de Obras",
    short_name: "ObraFlow",
    description:
      "Acompanhe cada obra em tempo real: etapa atual, responsáveis, pendências e próximos passos.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#4f46e5",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
