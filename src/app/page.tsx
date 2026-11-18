export const instant = false;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function euro(wert: number | null) {
  if (wert === null || wert === undefined) return "–";
  return wert.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

export default async function Startseite() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: immobilien, error } = await supabase
    .from("properties")
    .select("id, name, city, purchase_price, current_value")
    .order("name");

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Immobilien-Controlling
            </h1>
            <p className="text-sm text-gray-600">Angemeldet als {user.email}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-gray-600 underline">Abmelden</button>
          </form>
        </header>

        <Link
          href="/belege"
          className="block rounded-2xl bg-white shadow p-4 text-center font-medium text-gray-900"
        >
          Belege hochladen und ansehen
        </Link>
        <Link
          href="/kosten"
          className="block rounded-2xl bg-white shadow p-4 text-center font-medium text-gray-900"
        >
          Kosten ansehen
        </Link>
        <Link
          href="/dashboard"
          className="block rounded-2xl bg-white shadow p-4 text-center font-medium text-gray-900"
        >
          Dashboard und Rendite
        </Link>
        <Link
          href="/mieten"
          className="block rounded-2xl bg-white shadow p-4 text-center font-medium text-gray-900"
        >
          Mieten und Zahlungen
        </Link>

        <section className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Ihre Immobilien</h2>
            <Link
              href="/immobilien/neu"
              className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium"
            >
              Neue Immobilie
            </Link>
          </div>

          {error && (
            <p className="text-sm text-red-600">
              Fehler beim Laden: {error.message}
            </p>
          )}

          {!error && (!immobilien || immobilien.length === 0) && (
            <p className="text-sm text-gray-600">
              Noch keine Immobilie angelegt. Klicken Sie auf „Neue Immobilie“.
            </p>
          )}

          {immobilien && immobilien.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {immobilien.map((immo) => (
                <li key={immo.id}>
                  <Link
                    href={`/immobilien/${immo.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded"
                  >
                    <span>
                      <span className="block font-medium text-gray-900">
                        {immo.name}
                      </span>
                      <span className="block text-sm text-gray-600">
                        {immo.city ?? "ohne Ort"}
                      </span>
                    </span>
                    <span className="text-sm text-gray-700">
                      {euro(immo.current_value ?? immo.purchase_price)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
