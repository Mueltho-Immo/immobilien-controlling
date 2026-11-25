import sharp from "sharp";

export type Erkannt = {
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  net_amount: string | null;
  vat_amount: string | null;
  vat_rate: string | null;
  gross_amount: string | null;
  confidence: Record<string, number>;
  rohtext: string;
};

function feld(alle: any, name: string) {
  const f = alle?.[name];
  if (!f) return { wert: null, konfidenz: 0 };
  const inhalt = f.valueString ?? f.content ?? f.valueObject?.content ?? null;
  const konfidenz = Number(f.confidence ?? 0);
  return { wert: typeof inhalt === "string" ? inhalt.trim() : null, konfidenz };
}

function zahl(text: string | null): string | null {
  if (!text) return null;
  const sauber = text
    .replace(/[^\d.,\-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(sauber);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function datum(text: string | null): string | null {
  if (!text) return null;
  const treffer = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!treffer) return null;
  const [, t, m, j] = treffer;
  const jahr = j.length === 2 ? `20${j}` : j;
  return `${jahr}-${m.padStart(2, "0")}-${t.padStart(2, "0")}`;
}

/** Kleiner für Azure: max. 2000 px, JPEG-Qualität 85. PDF bleibt unverändert. */
async function fuerAzure(inhalt: ArrayBuffer, mime: string) {
  const puffer = Buffer.from(inhalt);
  if (puffer.byteLength <= 3.5 * 1024 * 1024) {
    return { daten: puffer, mime };
  }
  if (!mime.startsWith("image/")) return { daten: puffer, mime };

  const verkleinert = await sharp(puffer)
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { daten: verkleinert, mime: "image/jpeg" };
}

export async function belegErkennen(
  inhalt: ArrayBuffer,
  mime: string
): Promise<Erkannt> {
  const ende = process.env.AZURE_DOCINT_ENDPOINT;
  const schluessel = process.env.AZURE_DOCINT_KEY;
  if (!ende || !schluessel) throw new Error("Azure-Zugang fehlt in .env.local.");

  const { daten, mime: gesendet } = await fuerAzure(inhalt, mime);
  const url = `${ende.replace(/\/$/, "")}/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30`;

  const start = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":
        gesendet === "application/pdf" ? "application/pdf" : "image/jpeg",
      "Ocp-Apim-Subscription-Key": schluessel,
    },
    body: new Uint8Array(daten),
  });

  if (start.status === 401 || start.status === 403) {
    throw new Error("Azure hat den Schlüssel abgelehnt. Bitte neuen Schlüssel eintragen.");
  }
  if (start.status === 429) {
    throw new Error("Azure ist ausgelastet. Bitte kurz später erneut versuchen.");
  }
  if (!start.ok && start.status !== 202) {
    const text = await start.text().catch(() => "");
    throw new Error(`Azure-Fehler ${start.status}: ${text.slice(0, 300)}`);
  }

  const warteadresse = start.headers.get("operation-location");
  if (!warteadresse) throw new Error("Azure hat keine Auftragsadresse geliefert.");

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await fetch(warteadresse, {
      headers: { "Ocp-Apim-Subscription-Key": schluessel },
    });
    if (!st.ok) continue;
    const ergebnis = await st.json();

    if (ergebnis.status === "running" || ergebnis.status === "notStarted") continue;
    if (ergebnis.status === "failed") {
      throw new Error("Azure konnte den Beleg nicht lesen. Bitte von Hand buchen.");
    }

    const felder = ergebnis?.analyzeResult?.documents?.[0]?.fields ?? {};
    const lief = feld(felder, "VendorName");
    const nr = feld(felder, "InvoiceId");
    const dat = feld(felder, "InvoiceDate");
    const netto = feld(felder, "SubTotal");
    const steuer = feld(felder, "TotalTax");
    const brutto = feld(felder, "InvoiceTotal");

    let satz: string | null = null;
    if (netto.wert && steuer.wert) {
      const n = Number(zahl(netto.wert));
      const s = Number(zahl(steuer.wert));
      if (Number.isFinite(n) && Number.isFinite(s) && n > 0) {
        const p = Math.round((s / n) * 100);
        if (p === 19 || p === 7) satz = String(p);
      }
    }

    const rohtext = String(ergebnis?.analyzeResult?.content ?? "").slice(0, 4000);

    return {
      supplier: lief.wert,
      invoice_number: nr.wert,
      invoice_date: datum(dat.wert),
      net_amount: zahl(netto.wert),
      vat_amount: zahl(steuer.wert),
      vat_rate: satz,
      gross_amount: zahl(brutto.wert),
      confidence: {
        supplier: lief.konfidenz,
        invoice_number: nr.konfidenz,
        invoice_date: dat.konfidenz,
        gross_amount: brutto.konfidenz,
      },
      rohtext,
    };
  }

  throw new Error("Azure hat zu lange gebraucht. Bitte erneut versuchen.");
}
