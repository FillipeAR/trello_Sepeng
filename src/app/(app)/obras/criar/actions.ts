"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { createProject } from "@/modules/projects/commands";

export interface CriarState {
  message?: string;
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export async function criarAction(_prev: CriarState, formData: FormData): Promise<CriarState> {
  const actor = await requireActor();
  const project = await createProject(actor, {
    name: String(formData.get("name") ?? ""),
    client: String(formData.get("client") ?? ""),
    contractValue: Number(formData.get("contractValue") ?? 0),
    location: String(formData.get("location") ?? ""),
    plannedStartDate: parseLocalDate(String(formData.get("plannedStartDate") ?? "")),
    plannedEndDate: parseLocalDate(String(formData.get("plannedEndDate") ?? "")),
    scopeSummary: String(formData.get("scopeSummary") ?? ""),
  });
  redirect(`/obras/${project.id}`);
}
