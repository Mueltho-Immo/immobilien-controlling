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

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function buchungSpeichern(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const documentId = text(formData.get("document_id"));
  const propertyId = text(formData.get("property_id"));
  const categoryId = text(formData.get("category_id"));
  const gross = zahl(formData.get("gross_amount"));

  if (!documentId) redirect("/belege");

  function zurueck(fehler: string): never {
    redirect(`/belege/${documentId}?fehler=` + encodeURIComponent(fehler));
  }

  if (!propertyId) {
    zurueck("Bitte ein Objekt auswählen.");
  }

  if (!categoryId) {
    zurueck("Bitte eine Kategorie auswählen.");
  }

  if (gross === null || gross <= 0) {
    zurueck("Bitte einen Bruttobetrag größer als 0 eingeben.");
  }

  const { data: immo, error: immoFehler } = await supabase
    .from("properties")
    .select("id, organization_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (immoFehler || !immo) {
    zurueck("Objekt nicht gefunden.");
  }

  const { data: kategorie } = await supabase
    .from("expense_categories")
    .select("id, group_name")
    .eq("id", categoryId)
    .maybeSingle();

  if (!kategorie) {
    zurueck("Kategorie nicht gefunden.");
  }

  // Zins und Tilgung nur bei der Kategorie "Zins und Tilgung"
  let zins: number | null = null;
  let tilgung: number | null = null;

  if (kategorie.group_name === "financing_payment") {
    const z = zahl(formData.get("interest_amount"));
    const t = zahl(formData.get("principal_amount"));

    if ((z !== null && z < 0) || (t !== null && t < 0)) {
      zurueck("Zins und Tilgung dürfen nicht negativ sein.");
    }

    if (z !== null && t !== null) {
      if (Math.abs(r2(z + t) - r2(gross)) > 0.01) {
        zurueck(
          "Zins plus Tilgung müssen den Bruttobetrag ergeben (" +
            r2(z + t).toLocaleString("de-DE") +
            " statt " +
            r2(gross).toLocaleString("de-DE") +
            ")."
        );
      }
      zins = r2(z);
      tilgung = r2(t);
    } else if (z !== null) {
      if (z > gross) zurueck("Der Zinsanteil ist größer als der Bruttobetrag.");
      zins = r2(z);
      tilgung = r2(gross - z);
    } else if (t !== null) {
      if (t > gross) zurueck("Der Tilgungsanteil ist größer als der Bruttobetrag.");
      tilgung = r2(t);
      zins = r2(gross - t);
    }
  }

  const vatRate = zahl(formData.get("vat_rate"));
  let netto = zahl(formData.get("net_amount"));
  let ust = zahl(formData.get("vat_amount"));

  if (netto === null && vatRate !== null) {
    const satz = vatRate > 1 ? vatRate / 100 : vatRate;
    netto = Math.round((gross / (1 + satz)) * 100) / 100;
    ust = Math.round((gross - netto) * 100) / 100;
  }

  const { error } = await supabase.from("expenses").insert({
    organization_id: immo.organization_id,
    created_by: user.id,
    document_id: documentId,
    property_id: immo.id,
    unit_id: text(formData.get("unit_id")),
    category_id: categoryId,
    supplier: text(formData.get("supplier")),
    invoice_number: text(formData.get("invoice_number")),
    invoice_date: text(formData.get("invoice_date")),
    service_period: text(formData.get("service_period")),
    description: text(formData.get("description")),
    gross_amount: gross,
    net_amount: netto,
    vat_rate: vatRate,
    vat_amount: ust,
    payment_status: text(formData.get("payment_status")) ?? "offen",
    payment_date: text(formData.get("payment_date")),
    interest_amount: zins,
    principal_amount: tilgung,
  });

  if (error) {
    const meldung = error.message.includes("expenses_document_unique")
      ? "Dieser Beleg ist bereits gebucht."
      : error.message;
    zurueck(meldung);
  }

  revalidatePath("/belege");
  revalidatePath("/kosten");
  revalidatePath("/dashboard");
  redirect("/belege?gebucht=1");
}
