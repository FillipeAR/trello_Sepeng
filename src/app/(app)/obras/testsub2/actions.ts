"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/server/actor";
import { createProject } from "@/modules/projects/commands";

export interface TestState {
  message?: string;
}

export async function testSub2Action(_prev: TestState, _formData: FormData): Promise<TestState> {
  const actor = await requireActor();
  const project = await createProject(actor, {
    name: "Teste Isolamento DB",
    client: "Cliente Teste",
    contractValue: 1000,
    location: "Goiânia, GO",
    plannedStartDate: new Date("2026-08-10"),
    plannedEndDate: new Date("2026-09-10"),
    scopeSummary: "Teste de isolamento da escrita no banco.",
  });
  revalidatePath("/obras/testsub2");
  redirect(`/obras/testsub2/done?user=${actor.userEmail}&project=${project.id}`);
}
