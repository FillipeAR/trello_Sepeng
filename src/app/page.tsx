import { redirect } from "next/navigation";
import { getActor } from "@/server/actor";

export default async function Home() {
  const actor = await getActor();
  redirect(actor ? "/dashboard" : "/login");
}
