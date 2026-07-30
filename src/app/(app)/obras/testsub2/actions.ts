"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/server/actor";
import { createProject } from "@/modules/projects/commands";

export interface TestState {
  message?: string;
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export async function testSub2Action(_prev: TestState, formData: FormData): Promise<TestState> {
  const actor = await requireActor();
  const project = await createProject(actor, {
    name: String(formData.get("projectName") || "Nome padrão"),
    client: String(formData.get("client") || "Cliente padrão"),
    contractValue: Number(formData.get("contractValue") || 1000),
    location: String(formData.get("location") || "Goiânia, GO"),
    plannedStartDate: parseLocalDate(String(formData.get("plannedStartDate") || "2026-08-10")),
    plannedEndDate: parseLocalDate(String(formData.get("plannedEndDate") || "2026-09-10")),
    scopeSummary: String(formData.get("scopeSummary") || "Escopo padrão de teste."),
  });
  revalidatePath("/obras/testsub2");
  redirect(`/obras/testsub2/done?user=${actor.userEmail}&project=${project.id}`);
}
