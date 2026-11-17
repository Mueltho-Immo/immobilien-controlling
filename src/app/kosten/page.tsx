export const instant = false;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function euro(cent: number) {
  return (cent / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function datum(wert: string | null) {
  if (!wert) return "ohne Datum";
  return new Date(wert).toLocaleDateString("de-DE");
}

function inCent(betrag: number | string | null) {
  if (betrag === null || betrag === undefined) return 0;
  return Math.round(Number(betrag) * 100);
}

export default async function Kosten(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await props.searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let abfrage = supabase
    .from("kosten_je_objekt")
    .select(
      "expense_id, property_id, objekt, nutzungsart, kategorie, kategorie_gruppe, invoice_date, created_at, gross_amount, payment_status, supplier, beleg"
    )
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (status === "offen" || status === "bezahlt") {
    abfrage = abfrage.eq("payment_status", status);
  }

  const { data: zeilen, error } = await abfrage;

  // Nach Objekt gruppieren
  const objekte = new Map<
    string,
    { name: string; nutzungsart: string; zeilen: typeof zeilen }
  >();

  for (const z of zeilen ?? []) {
    if (!objekte.has(z.property_id)) {
      objekte.set(z.property_id, {
        name: z.objekt,
        nutzungsart: z.nutzungsart,
        zeilen: [],
      });
    }
    objekte.get(z.property_id)!.zeilen!.push(z);
  }

  const bloecke = Array.from(objekte.entries()).sort((a, b) =>
    a[1].name.localeCompare(b[1].name, "de")
  );

  const gesamtCent = (zeilen ?? []).reduce(
    (s, z) => s + inCent(z.gross_amount),
    0
  );

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <Link href="/" className="text-sm text-gray-600 underline">
            ← zurück zur Übersicht
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">Kosten</h1>
        </header>

        <nav className="flex items-center gap-2 text-sm">
          <FilterLink status={undefined} aktiv={!status} label="alle" />
          <FilterLink status="offen" aktiv={status === "offen"} label="offen" />
          <FilterLink
            status="bezahlt"
            aktiv={status === "bezahlt"}
            label="bezahlt"
          />
          <span className="ml-auto font-medium text-gray-900">
            Gesamt {euro(gesamtCent)}
          </span>
        </nav>

        {error && (
          <p className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
            Fehler beim Laden: {error.message}
          </p>
        )}

        {!error && bloecke.length === 0 && (
          <p className="rounded-2xl bg-white shadow p-6 text-sm text-gray-600">
            Keine Buchungen vorhanden.
          </p>
        )}

        {bloecke.map(([propertyId, block]) => {
          const summe = block.zeilen!.reduce(
            (s, z) => s + inCent(z.gross_amount),
            0
          );
          const hauptmiete = block.zeilen!
            .filter((z) => z.kategorie_gruppe === "rent_to_owner")
            .reduce((s, z) => s + inCent(z.gross_amount), 0);

          return (
            <section
              key={propertyId}
              className="bg-white rounded-2xl shadow p-6 space-y-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">
                    <Link
                      href={`/immobilien/${propertyId}`}
                      className="underline"
                    >
                      {block.name}
                    </Link>
                  </h2>
                  <p className="text-sm text-gray-600">
                    {block.nutzungsart === "eigentum"
                      ? "Eigentum"
                      : "Angemietet und weitervermietet"}
                  </p>
                </div>
                <span className="font-medium text-gray-900">
                  {euro(summe)}
                </span>
              </div>

              {block.nutzungsart !== "eigentum" && hauptmiete > 0 && (
                <p className="text-sm text-gray-600">
                  davon Zahlungen an den Eigentümer: {euro(hauptmiete)}
                </p>
              )}

              <ul className="divide-y divide-gray-100">
                {block.zeilen!.map((z) => (
                  <li
                    key={z.expense_id}
                    className="py-3 flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-600">
                        {datum(z.invoice_date)}
                        {z.supplier ? ` · ${z.supplier}` : ""}
                      </span>
                      <span className="block text-gray-900">{z.kategorie}</span>
                      {z.beleg && (
                        <span className="block text-xs text-gray-500 break-all">
                          Beleg: {z.beleg}
                        </span>
                      )}
                    </span>
                    <span className="flex items-baseline gap-3 whitespace-nowrap">
                      <span
                        className={
                          "text-xs rounded-full px-2 py-0.5 " +
                          (z.payment_status === "bezahlt"
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700")
                        }
                      >
                        {z.payment_status}
                      </span>
                      <span className="text-gray-900">
                        {euro(inCent(z.gross_amount))}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function FilterLink(props: {
  status?: string;
  aktiv: boolean;
  label: string;
}) {
  const href = props.status ? `/kosten?status=${props.status}` : "/kosten";
  return (
    <Link
      href={href}
      className={
        "rounded-full px-3 py-1 " +
        (props.aktiv
          ? "bg-gray-900 text-white"
          : "bg-white text-gray-700 border border-gray-300")
      }
    >
      {props.label}
    </Link>
  );
}
