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

export async function einheitAnlegen(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const immobilieId = text(formData.get("property_id"));
  const bezeichnung = text(formData.get("label"));

  if (!immobilieId || !bezeichnung) {
    redirect(
      `/immobilien/${immobilieId ?? ""}?fehler=` +
        encodeURIComponent("Bezeichnung fehlt")
    );
  }

  const { data: immo, error: immoError } = await supabase
    .from("properties")
    .select("id, organization_id")
    .eq("id", immobilieId)
    .maybeSingle();

  if (immoError || !immo) {
    redirect(
      `/immobilien/${immobilieId}?fehler=` +
        encodeURIComponent(
          "Immobilie nicht gefunden: " + (immoError?.message ?? "kein Zugriff")
        )
    );
  }

  const { error } = await supabase.from("units").insert({
    organization_id: immo.organization_id,
    property_id: immo.id,
    created_by: user.id,
    label: bezeichnung,
    unit_type: (text(formData.get("unit_type")) ?? "apartment") as
      | "apartment"
      | "parking"
      | "garage"
      | "commercial"
      | "other",
    area_sqm: zahl(formData.get("area_sqm")),
    target_rent: zahl(formData.get("target_rent")),
  });

  if (error) {
    redirect(
      `/immobilien/${immobilieId}?fehler=` +
        encodeURIComponent(error.message)
    );
  }

  revalidatePath(`/immobilien/${immobilieId}`);
  redirect(`/immobilien/${immobilieId}`);
}
