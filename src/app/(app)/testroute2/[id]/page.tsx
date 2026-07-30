export default async function TestRoute2IdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <div>Rota de teste 2 — id: {id}</div>;
}
