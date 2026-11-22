export const instant = false;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dauerbuchungAnlegen, dauerbuchungBeenden } from "./actions";

function euro(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function datum(s: string) {
  return new Date(s).toLocaleDateString("de-DE");
}

export default async function Dauerbuchungen({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: objekte } = await supabase
    .from("properties")
    .select("id, name")
    .order("name");

  const { data: kategorien } = await supabase
    .from("expense_categories")
    .select("id, name, group_name")
    .eq("is_active", true)
    .eq("group_name", "rent_to_owner")
    .order("sort_order");

  const { data: liste, error } = await supabase
    .from("recurring_costs")
    .select(
      "id, name, recipient, monthly_amount, valid_from, valid_to, property_id, category_id"
    )
    .order("valid_from", { ascending: false });

  const objektName = new Map((objekte ?? []).map((o) => [o.id, o.name]));
  const katName = new Map((kategorien ?? []).map((k) => [k.id, k.name]));
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <Link href="/" className="text-sm text-gray-600 underline">
            ← zurück zur Übersicht
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">
            Dauerbuchungen
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Feste monatliche Posten, die automatisch gebucht werden. Ohne
            Beleg. Zum Stoppen ein Enddatum setzen.
          </p>
        </header>

        {sp.ok && (
          <p className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
            {sp.ok === "2" ? "Dauerbuchung beendet." : "Dauerbuchung gespeichert."}
          </p>
        )}
        {sp.fehler && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-800">
            Das hat nicht geklappt. Prüfe die Eingaben.
            {sp.fehler !== "1" && sp.fehler !== "2" ? ` (${sp.fehler})` : ""}
          </p>
        )}

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Neue Dauerbuchung
          </h2>
          <form action={dauerbuchungAnlegen} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Bezeichnung</span>
              <input
                name="name"
                required
                placeholder="z. B. Hauptmiete"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Objekt</span>
              <select
                name="property_id"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">bitte wählen</option>
                {(objekte ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Kategorie</span>
              <select
                name="category_id"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">bitte wählen</option>
                {(kategorien ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Betrag monatlich (€)</span>
                <input
                  name="monthly_amount"
                  required
                  inputMode="decimal"
                  placeholder="1500,00"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Gültig ab</span>
                <input
                  type="date"
                  name="valid_from"
                  required
                  defaultValue={heute}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Empfänger (optional)
              </span>
              <input
                name="recipient"
                placeholder="z. B. Vermieter"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Dauerbuchung anlegen
            </button>
          </form>
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Bestehende Dauerbuchungen
          </h2>

          {error && (
            <p className="text-sm text-red-600">Fehler beim Laden: {error.message}</p>
          )}

          {!error && (!liste || liste.length === 0) && (
            <p className="text-sm text-gray-600">Noch keine Dauerbuchung vorhanden.</p>
          )}

          {liste && liste.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {liste.map((r) => (
                <li key={r.id} className="py-4 flex flex-wrap justify-between gap-4">
                  <span>
                    <span className="block font-medium text-gray-900">{r.name}</span>
                    <span className="block text-sm text-gray-600">
                      {objektName.get(r.property_id) ?? "Objekt unbekannt"} ·{" "}
                      {katName.get(r.category_id ?? "") ?? "Kategorie unbekannt"}
                      {r.recipient ? ` · an ${r.recipient}` : ""}
                    </span>
                    <span className="block text-sm text-gray-600">
                      {euro(Number(r.monthly_amount))} monatlich · ab {datum(r.valid_from)}
                      {r.valid_to ? ` · beendet am ${datum(r.valid_to)}` : ""}
                    </span>
                  </span>

                  {!r.valid_to ? (
                    <form action={dauerbuchungBeenden} className="flex items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="block">
                        <span className="block text-sm text-gray-700">Beenden am</span>
                        <input
                          type="date"
                          name="valid_to"
                          required
                          defaultValue={heute}
                          className="mt-1 rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900"
                      >
                        Beenden
                      </button>
                    </form>
                  ) : (
                    <span className="text-sm text-gray-500">beendet</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
