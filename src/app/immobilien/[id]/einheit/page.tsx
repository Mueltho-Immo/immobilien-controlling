export const instant = false;

import Link from "next/link";
import { notFound } from "next/navigation";
import { einheitAnlegen } from "../../actions-units";
import { createClient } from "@/lib/supabase/server";

export default async function NeueEinheit(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: immo } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!immo) notFound();

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <header>
          <Link
            href={`/immobilien/${immo.id}`}
            className="text-sm text-gray-600 underline"
          >
            ← zurück zu {immo.name}
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">
            Neue Einheit
          </h1>
        </header>

        <form
          action={einheitAnlegen}
          className="bg-white rounded-2xl shadow p-6 space-y-5"
        >
          <input type="hidden" name="property_id" value={immo.id} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bezeichnung
            </label>
            <input
              name="label"
              required
              placeholder="z. B. Wohnung 1. OG links"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Art
            </label>
            <select
              name="unit_type"
              defaultValue="apartment"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
            >
              <option value="apartment">Wohnung</option>
              <option value="parking">Stellplatz</option>
              <option value="garage">Garage</option>
              <option value="commercial">Gewerbe</option>
              <option value="other">Sonstiges</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fläche in m²
              </label>
              <input
                name="area_sqm"
                inputMode="decimal"
                placeholder="z. B. 78,5"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Soll-Miete in Euro
              </label>
              <input
                name="target_rent"
                inputMode="decimal"
                placeholder="z. B. 850"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 text-white py-2 font-medium"
          >
            Einheit speichern
          </button>
        </form>
      </div>
    </main>
  );
}
