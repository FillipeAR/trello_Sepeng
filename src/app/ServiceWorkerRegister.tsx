"use client";

import { useEffect } from "react";

/**
 * Só registra em produção — em dev o cache do service worker atrapalha o
 * hot reload do Turbopack (a página fica presa numa versão cacheada).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o app continua funcionando normalmente — só perde
      // o cache offline. Não é um erro que valha interromper nada.
    });
  }, []);

  return null;
}
