"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function toNumber(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export async function zahlungBuchen(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tenancyId = String(formData.get("tenancy_id") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const amount = toNumber(formData.get("amount"));
  const paidDate = String(formData.get("paid_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const back = `/mieten?monat=${year}-${String(month).padStart(2, "0")}`;

  if (!tenancyId || !year || !month || !(amount > 0) || !paidDate) {
    redirect(`${back}&fehler=${encodeURIComponent("Bitte Betrag und Datum prüfen.")}`);
  }

  const { data: ten } = await supabase
    .from("tenancies")
    .select("organization_id")
    .eq("id", tenancyId)
    .maybeSingle();

  if (!ten) {
    redirect(`${back}&fehler=${encodeURIComponent("Mietverhältnis nicht gefunden.")}`);
  }

    const { data: ten2 } = await supabase
    .from("tenancies")
    .select("cold_rent, service_charge_advance")
    .eq("id", tenancyId)
    .maybeSingle();

  const { data: ch } = await supabase
    .from("rent_changes")
    .select("valid_from, cold_rent, service_charge_advance")
    .eq("tenancy_id", tenancyId)
    .lte("valid_from", `${year}-${String(month).padStart(2, "0")}-31`)
    .order("valid_from", { ascending: false })
    .limit(1);

  const cold = Number(ch?.[0]?.cold_rent ?? ten2?.cold_rent ?? 0);
  const adv = Number(ch?.[0]?.service_charge_advance ?? ten2?.service_charge_advance ?? 0);

  const { data: bisher } = await supabase
    .from("rent_payments")
    .select("amount, kind")
    .eq("tenancy_id", tenancyId)
    .eq("year", year)
    .eq("month", month);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sum = (k: string) =>
    (bisher ?? []).filter((p) => p.kind === k).reduce((s, p) => s + Number(p.amount ?? 0), 0);

  let rest = amount;
  const teile: { kind: string; amount: number }[] = [];
  const offenKalt = Math.max(0, r2(cold - sum("kaltmiete")));
  const a1 = Math.min(rest, offenKalt);
  if (a1 > 0) { teile.push({ kind: "kaltmiete", amount: r2(a1) }); rest = r2(rest - a1); }
  const offenNk = Math.max(0, r2(adv - sum("nebenkosten")));
  const a2 = Math.min(rest, offenNk);
  if (a2 > 0) { teile.push({ kind: "nebenkosten", amount: r2(a2) }); rest = r2(rest - a2); }
  if (rest > 0) teile.push({ kind: "nachzahlung", amount: r2(rest) });

  const { error } = await supabase.from("rent_payments").insert(
    teile.map((t) => ({
      organization_id: ten.organization_id,
      tenancy_id: tenancyId,
      year,
      month,
      due_date: `${year}-${String(month).padStart(2, "0")}-01`,
      paid_date: paidDate,
      amount: t.amount,
      kind: t.kind,
      notes,
      created_by: user.id,
    }))
  );

  if (error) {
    redirect(`${back}&fehler=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mieten");
  redirect(back);
}
