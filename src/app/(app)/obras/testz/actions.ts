"use server";

import { requireActor } from "@/server/actor";

export interface TestState {
  message?: string;
}

export async function testZAction(_prev: TestState, formData: FormData): Promise<TestState> {
  const actor = await requireActor();
  return { message: `OK: ${actor.userEmail} ${formData.get("a")}/${formData.get("b")}/${formData.get("c")}` };
}
