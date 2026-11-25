export const instant = false;

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buchungSpeichern } from "../actions";
import { buchungStornieren, buchungReaktivieren } from "../storno";
import { belegAuslesen } from "../ocr-action";

export default async function BelegBuchen(props: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{
    fehler?: string;
    ok?: string;
    erkannt?: string;
    unsicher?: string;
    supplier?: string;
    invoice_number?: string;
    invoice_date?: string;
    net_amount?: string;
    vat_rate?: string;
    gross_amount?: string;
  }>;
}) {
  const { documentId } = await props.params;
  const sp = await props.searchParams;
  const { fehler, ok } = sp;

  const start = {
    supplier: sp.supplier ?? "",
    invoice_number: sp.invoice_number ?? "",
    invoice_date: sp.invoice_date ?? "",
    net_amount: sp.net_amount ?? "",
    vat_rate: sp.vat_rate ?? "19",
    gross_amount: sp.gross_amount ?? "",
  };

  const unsicher = new Set((sp.unsicher ?? "").split(",").filter(Boolean));

  const supabase = await createClient();

  const { data: beleg } = await supabase
    .from("documents")
    .select("id, original_name, mime_type, storage_path, created_at, status")
    .eq("id", documentId)
    .maybeSingle();

  if (!beleg) notFound();

  const { data: vorhandeneBuchung } = await supabase
    .from("expenses")
    .select(
      "id, gross_amount, invoice_date, status, reversed_at, reversal_reason, properties(name), expense_categories(name)"
    )
    .eq("document_id", beleg.id)
    .maybeSingle();

  const [{ data: objekte }, { data: kategorien }] = await Promise.all([
    supabase.from("properties").select("id, name, nutzungsart").order("name"),
    supabase
      .from("expense_categories")
      .select("id, name, group_name")
      .eq("is_active", true)
      .order("group_name")
      .order("sort_order"),
  ]);

  const { data: signed } = await supabase.storage
    .from("belege")
    .createSignedUrl(beleg.storage_path, 3600);

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <Link href="/belege" className="text-sm text-gray-600 underline">
            ← zurück zu den Belegen
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">
            Beleg buchen
          </h1>
          <p className="text-sm text-gray-600 break-all">{beleg.original_name}</p>
        </header>

        {ok && (
          <p className="rounded-lg bg-green-50 text-green-800 text-sm p-3">
            {ok === "1" ? "Buchung storniert." : "Storno rückgängig gemacht."}
          </p>
        )}

        {sp.erkannt && (
          <p className="rounded-lg bg-blue-50 text-blue-900 text-sm p-3">
            Beleg ausgelesen. Bitte die Werte prüfen und danach bestätigen.
            {unsicher.size > 0
              ? " Gelb markierte Felder hat die Erkennung nicht sicher gelesen."
              : ""}
          </p>
        )}

        {fehler && (
          <p className="rounded-lg bg-red-50 text-red-700 text-sm p-3">{fehler}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-sm font-medium text-gray-700 mb-3">Original</h2>
            {signed?.signedUrl ? (
              beleg.mime_type.startsWith("image/") ? (
                <img
                  src={signed.signedUrl}
                  alt={beleg.original_name}
                  className="w-full rounded-lg border border-gray-200"
                />
              ) : (
                <a
                  href={signed.signedUrl}
                  target="_blank"
                  className="text-sm text-gray-900 underline"
                >
                  PDF in neuem Tab öffnen
                </a>
              )
            ) : (
              <p className="text-sm text-gray-600">Vorschau nicht verfügbar.</p>
            )}
          </section>

          <section className="bg-white rounded-2xl shadow p-6">
            {vorhandeneBuchung ? (
              <div className="space-y-3">
                <h2 className="text-lg font-medium text-gray-900">
                  {vorhandeneBuchung.status === "reversed"
                    ? "Buchung storniert"
                    : "Bereits gebucht"}
                </h2>
                <p className="text-sm text-gray-700">
                  Objekt: {eins(vorhandeneBuchung.properties)?.name ?? "–"}
                </p>
                <p className="text-sm text-gray-700">
                  Kategorie:{" "}
                  {eins(vorhandeneBuchung.expense_categories)?.name ?? "–"}
                </p>
                <p className="text-sm text-gray-700">
                  Betrag:{" "}
                  {Number(vorhandeneBuchung.gross_amount).toLocaleString("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </p>

                {vorhandeneBuchung.status === "reversed" ? (
                  <>
                    <p className="text-sm text-gray-700">
                      Storniert am{" "}
                      {new Date(
                        vorhandeneBuchung.reversed_at ?? ""
                      ).toLocaleDateString("de-DE")}
                      {vorhandeneBuchung.reversal_reason
                        ? ` · Grund: ${vorhandeneBuchung.reversal_reason}`
                        : ""}
                    </p>
                    <p className="text-xs text-gray-600">
                      Die Buchung zählt nicht mehr in Kosten und Dashboard. Der
                      Beleg bleibt in der Liste sichtbar.
                    </p>
                    <form action={buchungReaktivieren}>
                      <input type="hidden" name="document_id" value={beleg.id} />
                      <input
                        type="hidden"
                        name="expense_id"
                        value={vorhandeneBuchung.id}
                      />
                      <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900">
                        Storno rückgängig machen
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <form action={buchungStornieren} className="space-y-3">
                      <input type="hidden" name="document_id" value={beleg.id} />
                      <input
                        type="hidden"
                        name="expense_id"
                        value={vorhandeneBuchung.id}
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Grund (optional)
                        </label>
                        <input
                          name="reason"
                          placeholder="z. B. doppelt erfasst"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                        />
                      </div>
                      <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white">
                        Buchung stornieren
                      </button>
                    </form>
                    <Link
                      href="/belege"
                      className="inline-block rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium"
                    >
                      Zur Belegliste
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <>
                <form action={belegAuslesen} className="mb-4">
                  <input type="hidden" name="document_id" value={beleg.id} />
                  <button className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900">
                    Beleg auslesen
                  </button>
                </form>

                <form action={buchungSpeichern} className="space-y-4">
                  <input type="hidden" name="document_id" value={beleg.id} />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Objekt
                    </label>
                    <select
                      name="property_id"
                      required
                      defaultValue=""
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                    >
                      <option value="" disabled>
                        bitte wählen
                      </option>
                      {(objekte ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kategorie
                    </label>
                    <select
                      name="category_id"
                      required
                      defaultValue=""
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                    >
                      <option value="" disabled>
                        bitte wählen
                      </option>
                      {(kategorien ?? []).map((k) => (
                        <option key={k.id} value={k.id}>
                          {gruppenName(k.group_name)} · {k.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Feld
                      name="supplier"
                      label="Lieferant"
                      defaultValue={start.supplier}
                      wackelig={unsicher.has("supplier")}
                    />
                    <Feld
                      name="invoice_number"
                      label="Rechnungsnummer"
                      defaultValue={start.invoice_number}
                      wackelig={unsicher.has("invoice_number")}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Feld
                      name="invoice_date"
                      label="Rechnungsdatum"
                      type="date"
                      defaultValue={start.invoice_date}
                      wackelig={unsicher.has("invoice_date")}
                    />
                    <Feld
                      name="service_period"
                      label="Leistungszeitraum (Text)"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Feld
                      name="gross_amount"
                      label="Bruttobetrag"
                      inputMode="decimal"
                      required
                      defaultValue={start.gross_amount}
                      wackelig={unsicher.has("gross_amount")}
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        USt-Satz
                      </label>
                      <select
                        name="vat_rate"
                        defaultValue={start.vat_rate}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                      >
                        <option value="19">19 %</option>
                        <option value="7">7 %</option>
                        <option value="0">0 %</option>
                      </select>
                    </div>
                    <Feld
                      name="net_amount"
                      label="Nettobetrag (leer = berechnen)"
                      inputMode="decimal"
                      defaultValue={start.net_amount}
                    />
                  </div>

                  <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
                    <legend className="px-2 text-sm font-medium text-gray-700">
                      Nur bei Kategorie „Zins und Tilgung“
                    </legend>
                    <p className="text-xs text-gray-600">
                      Zins plus Tilgung müssen den Bruttobetrag ergeben. Trägst du
                      nur einen Wert ein, rechnet die App den anderen aus. Bleiben
                      beide leer, zählt der ganze Betrag als Zins.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Feld
                        name="interest_amount"
                        label="Zinsanteil"
                        inputMode="decimal"
                      />
                      <Feld
                        name="principal_amount"
                        label="Tilgungsanteil"
                        inputMode="decimal"
                      />
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Zahlungsstatus
                      </label>
                      <select
                        name="payment_status"
                        defaultValue="offen"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                      >
                        <option value="offen">offen</option>
                        <option value="bezahlt">bezahlt</option>
                      </select>
                    </div>
                    <Feld name="payment_date" label="Zahlungsdatum" type="date" />
                  </div>

                  <Feld name="description" label="Beschreibung" />

                  <button
                    type="submit"
                    className="w-full rounded-lg bg-gray-900 text-white py-2 font-medium"
                  >
                    Buchung bestätigen
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Feld(props: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  inputMode?: "decimal" | "text";
  defaultValue?: string;
  wackelig?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {props.label}
        {props.wackelig && (
          <span className="ml-1 text-xs font-normal text-amber-700">
            bitte prüfen
          </span>
        )}
      </label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        inputMode={props.inputMode}
        defaultValue={props.defaultValue ?? ""}
        placeholder={
          props.inputMode === "decimal" ? "z. B. 1190 oder 1.190,00" : undefined
        }
        className={`w-full rounded-lg border px-3 py-2 text-gray-900 ${
          props.wackelig ? "border-amber-400 bg-amber-50" : "border-gray-300"
        }`}
      />
    </div>
  );
}

function gruppenName(gruppe: string) {
  switch (gruppe) {
    case "running_cost":
      return "Laufende Kosten";
    case "rent_to_owner":
      return "Hauptmiete";
    case "acquisition_cost":
      return "Anschaffung";
    case "financing_payment":
      return "Finanzierung";
    default:
      return "Sonstiges";
  }
}

function eins<T>(wert: T | T[] | null | undefined): T | null {
  if (wert === null || wert === undefined) return null;
  return Array.isArray(wert) ? (wert[0] ?? null) : wert;
}
