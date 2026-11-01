import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const DEV_API_PROXY_TARGET = "http://localhost:8000";

// Os rewrites são gravados no build: sem o destino, o deploy subiria sem API.
function resolveApiProxyTarget(phase: string): string {
  const target = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "");
  if (target) return target;

  if (phase === PHASE_PRODUCTION_BUILD) {
    throw new Error(
      "API_PROXY_TARGET é obrigatória no build de produção. Veja .env.example.",
    );
  }
  return DEV_API_PROXY_TARGET;
}

export default function createNextConfig(phase: string): NextConfig {
  const apiProxyTarget = resolveApiProxyTarget(phase);

  return {
    cacheComponents: true,
    partialPrefetching: true,
    experimental: {
      // O agent tem até 120 s; o padrão de 30 s cortaria o turno no meio.
      proxyTimeout: 130_000,
    },
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
    async rewrites() {
      return [
        { source: "/api/:path*", destination: `${apiProxyTarget}/:path*` },
      ];
    },
  };
}
