"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function buchungStornieren(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const documentId = String(formData.get("document_id") ?? "");
  const expenseId = String(formData.get("expense_id") ?? "");
  const grund = String(formData.get("reason") ?? "").trim() || null;

  if (!documentId || !expenseId) redirect("/belege");

  const zurueck = (text: string): never =>
    redirect(`/belege/${documentId}?fehler=` + encodeURIComponent(text));

  const { data: buchung } = await supabase
    .from("expenses")
    .select("id, status")
    .eq("id", expenseId)
    .maybeSingle();

  if (!buchung) {
    zurueck("Buchung nicht gefunden.");
  } else if (buchung.status === "reversed") {
    zurueck("Diese Buchung ist bereits storniert.");
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      status: "reversed",
      reversed_at: new Date().toISOString(),
      reversal_reason: grund,
    })
    .eq("id", expenseId);

  if (error) zurueck(error.message);

  revalidatePath("/belege");
  revalidatePath(`/belege/${documentId}`);
  revalidatePath("/kosten");
  revalidatePath("/dashboard");
  redirect(`/belege/${documentId}?ok=1`);
}

export async function buchungReaktivieren(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const documentId = String(formData.get("document_id") ?? "");
  const expenseId = String(formData.get("expense_id") ?? "");

  if (!documentId || !expenseId) redirect("/belege");

  const zurueck = (text: string): never =>
    redirect(`/belege/${documentId}?fehler=` + encodeURIComponent(text));

  const { error } = await supabase
    .from("expenses")
    .update({
      status: "confirmed",
      reversed_at: null,
      reversal_reason: null,
    })
    .eq("id", expenseId);

  if (error) zurueck(error.message);

  revalidatePath("/belege");
  revalidatePath(`/belege/${documentId}`);
  revalidatePath("/kosten");
  revalidatePath("/dashboard");
  redirect(`/belege/${documentId}?ok=2`);
}
