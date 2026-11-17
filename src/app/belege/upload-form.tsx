"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ERLAUBT = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const MAX_MB = 25;

async function sha256(datei: File): Promise<string> {
  const puffer = await datei.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", puffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function UploadForm() {
  const router = useRouter();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  async function hochladen(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    e.target.value = "";
    if (!datei) return;

    setMeldung(null);
    setFehler(false);

    if (!ERLAUBT.includes(datei.type)) {
      setFehler(true);
      setMeldung("Dateityp nicht erlaubt. Erlaubt sind Foto (JPG, PNG, HEIC, WebP) und PDF.");
      return;
    }
    if (datei.size > MAX_MB * 1024 * 1024) {
      setFehler(true);
      setMeldung(`Datei ist größer als ${MAX_MB} MB.`);
      return;
    }

    setLaeuft(true);
    const supabase = createClient();

    try {
      const { data: orgs, error: orgFehler } = await supabase
        .from("my_orgs")
        .select("organization_id")
        .limit(1);
      if (orgFehler || !orgs || orgs.length === 0) {
        throw new Error("Keine Organisation gefunden.");
      }
      const orgId = orgs[0].organization_id as string;

      const { data: userData } = await supabase.auth.getUser();
      const hash = await sha256(datei);

      const { data: vorhanden } = await supabase
        .from("documents")
        .select("id, original_name, created_at")
        .eq("organization_id", orgId)
        .eq("sha256", hash)
        .maybeSingle();

      if (vorhanden) {
        setFehler(true);
        setMeldung(
          `Dieser Beleg ist schon vorhanden („${vorhanden.original_name}", hochgeladen am ${new Date(
            vorhanden.created_at
          ).toLocaleDateString("de-DE")}).`
        );
        return;
      }

      const id = crypto.randomUUID();
      const endung = (datei.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const pfad = `${orgId}/${id}/original.${endung || "bin"}`;

      const { error: uploadFehler } = await supabase.storage
        .from("belege")
        .upload(pfad, datei, { contentType: datei.type, upsert: false });
      if (uploadFehler) throw new Error("Upload fehlgeschlagen: " + uploadFehler.message);

      const { error: dbFehler } = await supabase.from("documents").insert({
        id,
        organization_id: orgId,
        storage_path: pfad,
        original_name: datei.name,
        mime_type: datei.type,
        size_bytes: datei.size,
        sha256: hash,
        uploaded_by: userData.user?.id ?? null,
      });

      if (dbFehler) {
        await supabase.storage.from("belege").remove([pfad]);
        throw new Error("Speichern fehlgeschlagen: " + dbFehler.message);
      }

      setMeldung(`„${datei.name}" wurde gespeichert.`);
      router.refresh();
    } catch (err) {
      setFehler(true);
      setMeldung(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block w-full rounded-lg bg-gray-900 text-white text-center py-3 font-medium cursor-pointer">
        {laeuft ? "Wird hochgeladen…" : "Beleg fotografieren oder Datei wählen"}
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={hochladen}
          disabled={laeuft}
          className="hidden"
        />
      </label>
      {meldung && (
        <p className={"text-sm rounded-lg p-3 " + (fehler ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>
          {meldung}
        </p>
      )}
    </div>
  );
}
