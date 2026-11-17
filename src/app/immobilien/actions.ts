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
    if (letztesKomma > letzterPunkt) {
      normalisiert = roh.replace(/\./g, "").replace(",", ".");
    } else {
      normalisiert = roh.replace(/,/g, "");
    }
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

export async function immobilieAnlegen(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const name = text(formData.get("name"));
  if (!name) redirect("/immobilien/neu?fehler=Name%20fehlt");

  const { data: mitgliedschaft, error: mitgliedError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (mitgliedError || !mitgliedschaft) {
    redirect(
      "/immobilien/neu?fehler=" +
        encodeURIComponent(
          "Keine Organisation gefunden: " +
            (mitgliedError?.message ?? "keine Mitgliedschaft für " + user.email)
        )
    );
  }

    const nutzungsart =
    text(formData.get("nutzungsart")) === "eigentum"
      ? "eigentum"
      : "zwischenmiete";
  const istEigentum = nutzungsart === "eigentum";

  const { data, error } = await supabase
    .from("properties")
    .insert({
      organization_id: mitgliedschaft.organization_id,
      created_by: user.id,
      name,
      street: text(formData.get("street")),
      postal_code: text(formData.get("postal_code")),
      city: text(formData.get("city")),
      nutzungsart,
      purchase_date: text(formData.get("purchase_date")),
      living_area_sqm: zahl(formData.get("living_area_sqm")),
      current_value: zahl(formData.get("current_value")),
      purchase_price: istEigentum ? zahl(formData.get("purchase_price")) : null,
      acquisition_tax: istEigentum
        ? zahl(formData.get("acquisition_tax"))
        : null,
      notary_costs: istEigentum ? zahl(formData.get("notary_costs")) : null,
      other_acq_costs: istEigentum
        ? zahl(formData.get("other_acq_costs"))
        : null,
      equity: istEigentum ? zahl(formData.get("equity")) : null,
      eigentuemer: istEigentum ? null : text(formData.get("eigentuemer")),
      eigentuemer_kontakt: istEigentum
        ? null
        : text(formData.get("eigentuemer_kontakt")),
      hauptmiete: istEigentum ? null : zahl(formData.get("hauptmiete")),
      hauptmiete_intervall: istEigentum
        ? null
        : (text(formData.get("hauptmiete_intervall")) ?? "monatlich"),
      nebenkostenvorauszahlung: istEigentum
        ? null
        : zahl(formData.get("nebenkostenvorauszahlung")),
      kaution: istEigentum ? null : zahl(formData.get("kaution")),
    })
    .select("id")
    .single();


  if (error || !data) {
    redirect(
      "/immobilien/neu?fehler=" +
        encodeURIComponent(error?.message ?? "Speichern fehlgeschlagen")
    );
  }

  revalidatePath("/");
  redirect(`/immobilien/${data.id}`);
}