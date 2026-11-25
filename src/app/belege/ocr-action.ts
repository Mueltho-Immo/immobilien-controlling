"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { belegErkennen } from "@/lib/ocr";

export async function belegAuslesen(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const documentId = String(formData.get("document_id") ?? "");
  if (!documentId) redirect("/belege?fehler=1");

  const { data: beleg, error } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !beleg) {
    redirect(
      `/belege/${documentId}?fehler=${encodeURIComponent("Beleg nicht gefunden.")}`
    );
  }

  const { data: datei, error: dlFehler } = await supabase.storage
    .from("belege")
    .download(beleg.storage_path);

  if (dlFehler || !datei) {
    redirect(
      `/belege/${documentId}?fehler=${encodeURIComponent(
        "Beleg konnte nicht geladen werden: " + (dlFehler?.message ?? "unbekannt")
      )}`
    );
  }

  try {
    const erkannt = await belegErkennen(await datei.arrayBuffer(), beleg.mime_type);

    const p = new URLSearchParams();
    if (erkannt.supplier) p.set("supplier", erkannt.supplier);
    if (erkannt.invoice_number) p.set("invoice_number", erkannt.invoice_number);
    if (erkannt.invoice_date) p.set("invoice_date", erkannt.invoice_date);
    if (erkannt.net_amount) p.set("net_amount", erkannt.net_amount);
    if (erkannt.vat_rate) p.set("vat_rate", erkannt.vat_rate);
    if (erkannt.gross_amount) p.set("gross_amount", erkannt.gross_amount);

    const unsicher = Object.entries(erkannt.confidence)
      .filter(([, wert]) => wert > 0 && wert < 0.6)
      .map(([name]) => name);
    if (unsicher.length) p.set("unsicher", unsicher.join(","));

    revalidatePath(`/belege/${documentId}`);
    redirect(`/belege/${documentId}?erkannt=1&${p.toString()}`);
  } catch (f) {
    const text = f instanceof Error ? f.message : "Unbekannter Fehler.";
    redirect(`/belege/${documentId}?fehler=${encodeURIComponent(text)}`);
  }
}
