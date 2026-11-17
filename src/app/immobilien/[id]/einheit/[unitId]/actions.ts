"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function zahl(wert: FormDataEntryValue | null): number | null {
  if (wert === null) return null;
  const roh = String(wert).trim();
  if (roh === "") return null;

  let normalisiert: string;
  if (roh.includes(",") && roh.includes(".")) {
    const letztesKomma = roh.lastIndexOf(",");
    const letzterPunkt = roh.lastIndexOf(".");
    normalisiert =
      letztesKomma > letzterPunkt
        ? roh.replace(/\./g, "").replace(",", ".")
        : roh.replace(/,/g, "");
  } else if (roh.includes(",")) {
    normalisiert = roh.replace(",", ".");
  } else {
    normalisiert = roh;
  }

  const n = Number(normalisiert);
  return Number.isFinite(n) ? n : null;
}

function text(wert: FormDataEntryValue | null): string | null {
  const t = String(wert ?? "").trim();
  return t === "" ? null : t;
}

export async function vertragAnlegen(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const unitId = text(formData.get("unit_id"));
  const immobilieId = text(formData.get("immobilie_id"));
  const mieterName = text(formData.get("tenant_name"));
  const beginn = text(formData.get("start_date"));
  const kaltmiete = zahl(formData.get("cold_rent"));

    const basis = `/immobilien/${immobilieId}/einheit/${unitId}`;

  function zurueck(fehler: string): never {
    redirect(basis + "?fehler=" + encodeURIComponent(fehler));
  }


  if (!unitId || !immobilieId) redirect("/");
  if (!mieterName) {
    zurueck("Bitte den Namen des Mieters angeben.");
  }
  if (!beginn) {
    zurueck("Bitte den Vertragsbeginn angeben.");
  }
  if (kaltmiete === null || kaltmiete <= 0) {
    zurueck("Bitte eine Kaltmiete größer als 0 angeben.");
  }

  const { data: einheit, error: einheitFehler } = await supabase
    .from("units")
    .select("id, organization_id")
    .eq("id", unitId)
    .maybeSingle();

  if (einheitFehler || !einheit) {
    zurueck("Einheit nicht gefunden.");
  }

  const orgId = einheit.organization_id;
  const beginnDatum = beginn as string;

  const { data: mieter, error: mieterFehler } = await supabase
    .from("tenants")
    .insert({
      organization_id: orgId,
      created_by: user.id,
      name: mieterName,
      phone: text(formData.get("tenant_phone")),
      email: text(formData.get("tenant_email")),
      address: text(formData.get("tenant_address")),
    })
    .select("id")
    .single();

  if (mieterFehler || !mieter) {
    zurueck(
      "Mieter konnte nicht gespeichert werden: " + (mieterFehler?.message ?? "")
    );
  }

  const { data: laufender } = await supabase
    .from("tenancies")
    .select("id, start_date")
    .eq("unit_id", unitId)
    .eq("status", "aktiv")
    .maybeSingle();

  if (laufender) {
    const tagVorBeginn = new Date(beginnDatum + "T00:00:00");
    tagVorBeginn.setDate(tagVorBeginn.getDate() - 1);
    const ende = [
      tagVorBeginn.getFullYear(),
      String(tagVorBeginn.getMonth() + 1).padStart(2, "0"),
      String(tagVorBeginn.getDate()).padStart(2, "0"),
    ].join("-");

    if (ende < laufender.start_date) {
      zurueck("Der neue Vertrag beginnt vor dem alten. Bitte Daten prüfen.");
    }

    await supabase
      .from("tenancies")
      .update({ status: "beendet", end_date: ende })
      .eq("id", laufender.id);
  }

  const { error: vertragFehler } = await supabase.from("tenancies").insert({
    organization_id: orgId,
    created_by: user.id,
    unit_id: unitId,
    tenant_id: mieter.id,
    start_date: beginnDatum,
    end_date: text(formData.get("end_date")),
    cold_rent: kaltmiete,
    service_charge_advance: zahl(formData.get("service_charge_advance")) ?? 0,
    deposit: zahl(formData.get("deposit")),
    deposit_received: formData.get("deposit_received") === "on",
    handover_date: text(formData.get("handover_date")),
    status: "aktiv",
  });

  if (vertragFehler) {
    zurueck("Vertrag: " + vertragFehler.message);
  }

  revalidatePath(`/immobilien/${immobilieId}/einheit/${unitId}`);
  redirect(`/immobilien/${immobilieId}/einheit/${unitId}`);
}
