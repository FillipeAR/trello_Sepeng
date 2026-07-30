"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/server/actor";

export interface TestState {
  message?: string;
}

export async function testSub2Action(_prev: TestState, _formData: FormData): Promise<TestState> {
  const actor = await requireActor();
  revalidatePath("/obras/testsub2");
  redirect(`/obras/testsub2/done?user=${actor.userEmail}`);
}
