"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { createProject } from "@/modules/projects/commands";

export interface TestState {
  message?: string;
}

export async function testFinalAction(_prev: TestState, _formData: FormData): Promise<TestState> {
  const actor = await requireActor();
  const project = await createProject(actor, {
    name: "Teste Redirect Real",
    client: "Cliente Teste",
    contractValue: 1000,
    location: "Goiânia, GO",
    plannedStartDate: new Date("2026-08-10"),
    plannedEndDate: new Date("2026-09-10"),
    scopeSummary: "Teste do redirect para /obras/[id] de verdade.",
  });
  redirect(`/obras/${project.id}`);
}
