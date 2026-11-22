"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function dauerbuchungAnlegen(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const propertyId = String(formData.get("property_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const recipient = String(formData.get("recipient") ?? "").trim();
  const betrag = Number(String(formData.get("monthly_amount") ?? "").replace(",", "."));
  const start = String(formData.get("valid_from") ?? "");

  if (!propertyId || !categoryId || !name || !start || !Number.isFinite(betrag) || betrag < 0) {
    redirect("/dauerbuchungen?fehler=1");
  }

  const { data: prop, error: propFehler } = await supabase
    .from("properties")
    .select("organization_id")
    .eq("id", propertyId)
    .single();

  if (propFehler || !prop) redirect("/dauerbuchungen?fehler=2");

  const { error } = await supabase.from("recurring_costs").insert({
    organization_id: prop.organization_id,
    property_id: propertyId,
    category_id: categoryId,
    name,
    recipient: recipient || null,
    monthly_amount: betrag,
    valid_from: start,
  });

  if (error) redirect(`/dauerbuchungen?fehler=${encodeURIComponent(error.message)}`);

  revalidatePath("/dauerbuchungen");
  redirect("/dauerbuchungen?ok=1");
}

export async function dauerbuchungBeenden(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const bis = String(formData.get("valid_to") ?? "");
  if (!id || !bis) redirect("/dauerbuchungen?fehler=1");

  const { error } = await supabase
    .from("recurring_costs")
    .update({ valid_to: bis })
    .eq("id", id);

  if (error) redirect(`/dauerbuchungen?fehler=${encodeURIComponent(error.message)}`);

  revalidatePath("/dauerbuchungen");
  redirect("/dauerbuchungen?ok=2");
}
