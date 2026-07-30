import { requireActor } from "@/server/actor";

export default async function ObrasTestSub2DonePage() {
  const actor = await requireActor();
  return <div>Deu certo! Ator: {actor.userEmail}</div>;
}
