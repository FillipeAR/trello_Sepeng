import { requireActor } from "@/server/actor";
import { TestSub2Form } from "./TestSub2Form";

export default async function ObrasTestSub2Page() {
  const actor = await requireActor();
  return (
    <div>
      <h1>Obras / testsub2 — {actor.userEmail}</h1>
      <TestSub2Form />
    </div>
  );
}
