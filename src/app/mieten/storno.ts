"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function zahlungStornieren(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("payment_id") ?? "");
  const back = String(formData.get("back") ?? "/mieten");

  const { data: p } = await supabase
    .from("rent_payments")
    .select("organization_id, tenancy_id, year, month, due_date, amount, kind, notes")
    .eq("id", id)
    .maybeSingle();

  if (!p || Number(p.amount) <= 0) {
    redirect(`${back}&fehler=${encodeURIComponent("Nur positive Zahlungen können storniert werden.")}`);
  }

  // Wurde schon storniert? (gleiche Notiz-Kennung)
  const marker = `Storno ${id}`;
  const { data: schon } = await supabase
    .from("rent_payments")
    .select("id")
    .eq("tenancy_id", p.tenancy_id)
    .eq("notes", marker)
    .limit(1);

  if (schon && schon.length > 0) {
    redirect(`${back}&fehler=${encodeURIComponent("Diese Zahlung wurde bereits storniert.")}`);
  }

  const { error } = await supabase.from("rent_payments").insert({
    organization_id: p.organization_id,
    tenancy_id: p.tenancy_id,
    year: p.year,
    month: p.month,
    due_date: p.due_date,
    paid_date: new Date().toISOString().slice(0, 10),
    amount: -Number(p.amount),
    kind: p.kind,
    notes: marker,
    created_by: user.id,
  });

  if (error) {
    redirect(`${back}&fehler=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mieten");
  redirect(back);
}
