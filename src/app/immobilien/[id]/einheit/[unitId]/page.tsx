export const instant = false;

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { vertragAnlegen } from "./actions";

function euro(wert: number | null) {
  if (wert === null || wert === undefined) return "–";
  return Number(wert).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function datum(wert: string | null) {
  if (!wert) return "–";
  return new Date(wert).toLocaleDateString("de-DE");
}

function eins<T>(wert: T | T[] | null | undefined): T | null {
  if (wert === null || wert === undefined) return null;
  return Array.isArray(wert) ? (wert[0] ?? null) : wert;
}

export default async function EinheitSeite(props: {
  params: Promise<{ id: string; unitId: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { id, unitId } = await props.params;
  const { fehler } = await props.searchParams;
  const supabase = await createClient();

  const { data: einheit } = await supabase
    .from("units")
    .select(
      "id, label, unit_type, area_sqm, target_rent, property_id, properties(name)"
    )
    .eq("id", unitId)
    .maybeSingle();

  if (!einheit) notFound();

  const { data: vertraege } = await supabase
    .from("tenancies")
    .select(
      "id, start_date, end_date, cold_rent, service_charge_advance, deposit, deposit_received, status, handover_date, tenants(name, phone, email)"
    )
    .eq("unit_id", unitId)
    .order("start_date", { ascending: false });

  const aktiv = (vertraege ?? []).find((v) => v.status === "aktiv");
  const historie = (vertraege ?? []).filter((v) => v.status !== "aktiv");

  const objektName = eins(einheit.properties)?.name ?? "";
  const mieterName = eins(aktiv?.tenants)?.name ?? "–";
  const mieterKontakt =
    eins(aktiv?.tenants)?.phone ?? eins(aktiv?.tenants)?.email ?? "–";

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <Link
            href={`/immobilien/${id}`}
            className="text-sm text-gray-600 underline"
          >
            ← zurück zur Immobilie
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">
            {einheit.label}
          </h1>
          <p className="text-sm text-gray-600">
            {objektName}
            {einheit.target_rent
              ? ` · Soll-Miete ${euro(einheit.target_rent)}`
              : ""}
          </p>
        </header>

        {fehler && (
          <p className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
            {fehler}
          </p>
        )}

        {aktiv ? (
          <section className="bg-white rounded-2xl shadow p-6 space-y-3">
            <h2 className="text-lg font-medium text-gray-900">
              Aktuelles Mietverhältnis
            </h2>
            <dl className="divide-y divide-gray-100">
              <Zeile label="Mieter" wert={mieterName} />
              <Zeile label="Kontakt" wert={mieterKontakt} />
              <Zeile label="Beginn" wert={datum(aktiv.start_date)} />
              <Zeile label="Kaltmiete" wert={euro(aktiv.cold_rent)} />
              <Zeile
                label="Nebenkostenvorauszahlung"
                wert={euro(aktiv.service_charge_advance)}
              />
              <Zeile label="Kaution" wert={euro(aktiv.deposit)} />
              <Zeile
                label="Kaution eingegangen"
                wert={aktiv.deposit_received ? "ja" : "nein"}
              />
            </dl>
          </section>
        ) : (
          <section className="bg-amber-50 rounded-2xl p-6">
            <p className="text-sm text-amber-800">
              Diese Einheit ist derzeit nicht vermietet (Leerstand).
            </p>
          </section>
        )}

        <section className="bg-white rounded-2xl shadow p-6 space-y-5">
          <h2 className="text-lg font-medium text-gray-900">
            {aktiv ? "Mieterwechsel eintragen" : "Vertrag anlegen"}
          </h2>
          <form action={vertragAnlegen} className="space-y-4">
            <input type="hidden" name="unit_id" value={einheit.id} />
            <input type="hidden" name="immobilie_id" value={id} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Feld name="tenant_name" label="Name des Mieters" required />
              <Feld name="tenant_phone" label="Telefon" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Feld name="tenant_email" label="E-Mail" />
              <Feld name="tenant_address" label="Anschrift Mieter" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Feld
                name="start_date"
                label={
                  aktiv ? "Beginn (nach dem alten Vertrag)" : "Vertragsbeginn"
                }
                type="date"
                required
              />
              <Feld
                name="end_date"
                label="Ende (leer = unbefristet)"
                type="date"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Feld
                name="cold_rent"
                label="Kaltmiete"
                inputMode="decimal"
                required
              />
              <Feld
                name="service_charge_advance"
                label="Nebenkostenvorauszahlung"
                inputMode="decimal"
              />
              <Feld name="deposit" label="Kaution" inputMode="decimal" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Feld name="handover_date" label="Übergabe" type="date" />
              <label className="flex items-center gap-2 mt-6 text-sm text-gray-700">
                <input type="checkbox" name="deposit_received" />
                Kaution ist eingegangen
              </label>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-900 text-white py-2 font-medium"
            >
              Vertrag speichern
            </button>
          </form>
        </section>

        {historie.length > 0 && (
          <section className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Frühere Mieter
            </h2>
            <ul className="divide-y divide-gray-100">
              {historie.map((v) => (
                <li key={v.id} className="py-3">
                  <p className="font-medium text-gray-900">
                    {eins(v.tenants)?.name ?? "–"}
                  </p>
                  <p className="text-sm text-gray-600">
                    {datum(v.start_date)} – {datum(v.end_date)} ·{" "}
                    {euro(v.cold_rent)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function Zeile(props: { label: string; wert: string }) {
  return (
    <div className="py-3 flex justify-between gap-4">
      <dt className="text-sm text-gray-600">{props.label}</dt>
      <dd className="text-sm text-gray-900 text-right">{props.wert}</dd>
    </div>
  );
}

function Feld(props: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  inputMode?: "decimal" | "text";
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {props.label}
      </label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        inputMode={props.inputMode}
        placeholder={
          props.inputMode === "decimal" ? "z. B. 850 oder 850,00" : undefined
        }
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
      />
    </div>
  );
}
