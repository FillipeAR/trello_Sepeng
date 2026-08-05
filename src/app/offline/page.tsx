/**
 * Fallback do service worker (`public/sw.js`) para navegação sem cache e sem
 * rede — não faz `requireActor()` de propósito, é servida offline pelo SW.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Sem conexão</h1>
      <p className="max-w-sm text-sm text-muted">
        Esta página ainda não foi aberta com internet, então não há uma versão salva pra
        mostrar offline. Atualizações de progresso registradas agora ficam guardadas no
        aparelho e sincronizam sozinhas assim que a conexão voltar.
      </p>
    </div>
  );
}
