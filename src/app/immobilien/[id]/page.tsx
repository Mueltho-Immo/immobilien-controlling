export const instant = false;

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function euro(wert: number | null) {
  if (wert === null || wert === undefined) return "–";
  return wert.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function datum(wert: string | null) {
  if (!wert) return "–";
  return new Date(wert).toLocaleDateString("de-DE");
}

function artLabel(art: string) {
  switch (art) {
    case "apartment":
      return "Wohnung";
    case "parking":
      return "Stellplatz";
    case "garage":
      return "Garage";
    case "commercial":
      return "Gewerbe";
    default:
      return "Sonstiges";
  }
}

export default async function ImmobilieDetail(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: immo, error } = await supabase
    .from("properties")
    .select(
      "id, name, street, postal_code, city, purchase_date, living_area_sqm, current_value, nutzungsart, eigentuemer, eigentuemer_kontakt, hauptmiete, hauptmiete_intervall, nebenkostenvorauszahlung, kaution, purchase_price, acquisition_tax, notary_costs, other_acq_costs, equity"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-red-600">
            Fehler beim Laden: {error.message}
          </p>
        </div>
      </main>
    );
  }

  if (!immo) notFound();

  const { data: einheiten } = await supabase
    .from("units")
    .select("id, label, unit_type, area_sqm, target_rent")
    .eq("property_id", id)
    .order("label");

  const anschaffung =
    (immo.purchase_price ?? 0) +
    (immo.acquisition_tax ?? 0) +
    (immo.notary_costs ?? 0) +
    (immo.other_acq_costs ?? 0);

  const istEigentum = immo.nutzungsart === "eigentum";

  const zeilen: Array<[string, string]> = istEigentum
    ? [
        [
          "Adresse",
          [immo.street, immo.postal_code, immo.city]
            .filter(Boolean)
            .join(", ") || "–",
        ],
        ["Kaufdatum", datum(immo.purchase_date)],
        [
          "Wohnfläche",
          immo.living_area_sqm ? `${immo.living_area_sqm} m²` : "–",
        ],
        ["Kaufpreis", euro(immo.purchase_price)],
        ["Grunderwerbsteuer", euro(immo.acquisition_tax)],
        ["Notar und Grundbuch", euro(immo.notary_costs)],
        ["Sonstige Anschaffungskosten", euro(immo.other_acq_costs)],
        ["Anschaffungskosten gesamt", euro(anschaffung)],
        ["Eigenkapital", euro(immo.equity)],
        ["Aktueller Wert", euro(immo.current_value)],
      ]
    : [
        [
          "Adresse",
          [immo.street, immo.postal_code, immo.city]
            .filter(Boolean)
            .join(", ") || "–",
        ],
        ["Vertragsbeginn", datum(immo.purchase_date)],
        [
          "Wohnfläche",
          immo.living_area_sqm ? `${immo.living_area_sqm} m²` : "–",
        ],
        ["Eigentümer", immo.eigentuemer ?? "–"],
        ["Kontakt Eigentümer", immo.eigentuemer_kontakt ?? "–"],
        ["Hauptmiete", euro(immo.hauptmiete)],
        ["Zahlungsweise", immo.hauptmiete_intervall ?? "monatlich"],
        [
          "Nebenkostenvorauszahlung an Eigentümer",
          euro(immo.nebenkostenvorauszahlung),
        ],
        ["Kaution", euro(immo.kaution)],
        ["Aktueller Wert", euro(immo.current_value)],
      ];

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <Link href="/" className="text-sm text-gray-600 underline">
            ← zurück zur Übersicht
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">
            {immo.name}
          </h1>
          <p className="text-sm text-gray-600">
            {istEigentum ? "Eigentum" : "Angemietet und weitervermietet"}
          </p>
        </header>

        <section className="bg-white rounded-2xl shadow p-6">
          <dl className="divide-y divide-gray-100">
            {zeilen.map(([bezeichnung, wert]) => (
              <div key={bezeichnung} className="py-3 flex justify-between gap-4">
                <dt className="text-sm text-gray-600">{bezeichnung}</dt>
                <dd className="text-sm text-gray-900 text-right">{wert}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Einheiten</h2>
            <Link
              href={`/immobilien/${immo.id}/einheit`}
              className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium"
            >
              Neue Einheit
            </Link>
          </div>

          {!einheiten || einheiten.length === 0 ? (
            <p className="text-sm text-gray-600">
              Noch keine Einheit angelegt.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {einheiten.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/immobilien/${immo.id}/einheit/${e.id}`}
                    className="py-3 flex justify-between gap-4 hover:bg-gray-50 px-2 rounded"
                  >
                    <span>
                      <span className="block font-medium text-gray-900">
                        {e.label}
                      </span>
                      <span className="block text-sm text-gray-600">
                        {artLabel(e.unit_type)}
                        {e.area_sqm ? ` · ${e.area_sqm} m²` : ""}
                        </span>
                    </span>
                    <span className="text-sm text-gray-700">
                      {euro(e.target_rent)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-gray-500">
          Kosten, Mieten und Kennzahlen folgen im nächsten Schritt.
        </p>
      </div>
    </main>
  );
}
