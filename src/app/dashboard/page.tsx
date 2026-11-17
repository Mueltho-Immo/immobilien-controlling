export const instant = false;

import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Chart, { type Monatswert } from "./Chart";
import {
  anschaffungskosten,
  groupLabel,
  imZeitraum,
  jahrZeitraum,
  kennzahlen,
  monatZeitraum,
  quartal,
  rendite,
  r2,
  zeitraumLabel,
  type Group,
  type Zeitraum,
} from "@/lib/kpi";

const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const pct = (n: number) =>
  `${n.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;

export default async function Dashboard(props: {
  searchParams: Promise<{ jahr?: string; quartal?: string; monat?: string }>;
}) {
  await connection();

  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const jahr = Number(sp.jahr) || now.getFullYear();
  const q = sp.quartal ? Number(sp.quartal) : null;
  const m = sp.monat ? Number(sp.monat) : null;

  let zeitraum: Zeitraum;
  let beschriftung: string;
  if (q && q >= 1 && q <= 4) {
    zeitraum = quartal(jahr, q);
    beschriftung = `Q${q} ${jahr}`;
  } else if (m && m >= 1 && m <= 12) {
    zeitraum = monatZeitraum(jahr, m);
    beschriftung = `${String(m).padStart(2, "0")}/${jahr}`;
  } else {
    zeitraum = jahrZeitraum(jahr);
    beschriftung = `ganzes Jahr ${jahr}`;
  }

  const [
    { data: properties },
    { data: categories },
    { data: expenses },
    { data: units },
    { data: tenancies },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, purchase_price, acquisition_tax, notary_costs, other_acq_costs, equity, nutzungsart"
      )
      .order("name"),
    supabase.from("expense_categories").select("id, name, group_name"),
    supabase
      .from("expenses")
      .select(
        "id, property_id, category_id, gross_amount, invoice_date, status, interest_amount, principal_amount"
      ),
    supabase.from("units").select("id, property_id"),
    supabase.from("tenancies").select("id, unit_id"),
    supabase
      .from("rent_payments")
      .select("tenancy_id, year, month, amount, kind"),
  ]);

  const catMap = new Map(
    (categories ?? []).map((c) => [c.id, c.group_name as Group])
  );
  const einheitZuObjekt = new Map(
    (units ?? []).map((u) => [u.id, u.property_id])
  );
  const vertragZuEinheit = new Map(
    (tenancies ?? []).map((t) => [t.id, t.unit_id])
  );

  /** Einnahmen einer Immobilie in einem Zeitraum, ohne Kaution. */
  const einnahmenFuer = (propertyId: string, z: Zeitraum) =>
    r2(
      (payments ?? [])
        .filter((p) => {
          if (p.kind === "kaution") return false;
          const unitId = vertragZuEinheit.get(p.tenancy_id);
          if (!unitId) return false;
          if (einheitZuObjekt.get(unitId) !== propertyId) return false;
          const am = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
          return imZeitraum(am, z);
        })
        .reduce((s, p) => s + Number(p.amount ?? 0), 0)
    );

  /** Kosten einer Immobilie nach Gruppe, dazu Zins und Tilgung getrennt. */
  const kostenFuer = (propertyId: string, z: Zeitraum) => {
    const nachGruppe: Record<string, number> = {};
    let zins = 0;
    let tilgung = 0;
    let getrennt = false;

    for (const e of (expenses ?? []).filter(
      (e) =>
        e.property_id === propertyId &&
        e.status !== "reversed" &&
        imZeitraum(e.invoice_date, z)
    )) {
      const g = catMap.get(e.category_id as string);
      if (!g) continue;
      nachGruppe[g] = r2((nachGruppe[g] ?? 0) + Number(e.gross_amount ?? 0));

      if (e.interest_amount !== null || e.principal_amount !== null) {
        getrennt = true;
        zins = r2(zins + Number(e.interest_amount ?? 0));
        tilgung = r2(tilgung + Number(e.principal_amount ?? 0));
      }
    }
    return { nachGruppe, zins, tilgung, getrennt };
  };

  const rows = (properties ?? []).map((p) => {
    const kf = kostenFuer(p.id, zeitraum);
    const k = kennzahlen({
      einnahmen: einnahmenFuer(p.id, zeitraum),
      kostenNachGruppe: kf.nachGruppe,
      zins: kf.getrennt ? kf.zins : undefined,
      tilgung: kf.getrennt ? kf.tilgung : undefined,
    });
    const ak = anschaffungskosten(p);
    return {
      p,
      k,
      ak,
      rd: rendite(k.nettoertrag, ak, Number(p.equity ?? 0)),
      kostenNachGruppe: kf.nachGruppe,
      getrennt: kf.getrennt,
    };
  });

  const summe = (f: (r: (typeof rows)[number]) => number) =>
    r2(rows.reduce((s, r) => s + f(r), 0));

  const gesamt = {
    einnahmen: summe((r) => r.k.einnahmen),
    kosten: summe(
      (r) => r.k.betriebsausgaben + r.k.hauptmiete + r.k.zinsUndTilgung
    ),
    cashflow: summe((r) => r.k.cashflow),
    nettoertrag: summe((r) => r.k.nettoertrag),
  };

  const gesamtRendite = rendite(
    gesamt.nettoertrag,
    r2(rows.reduce((s, r) => s + r.ak, 0)),
    r2(rows.reduce((s, r) => s + Number(r.p.equity ?? 0), 0))
  );

  const monatswerte: Monatswert[] = Array.from({ length: 12 }, (_, i) => {
    const mi = i + 1;
    const mz = monatZeitraum(jahr, mi);
    return {
      monat: mi,
      einnahmen: summe((r) => einnahmenFuer(r.p.id, mz)),
      kosten: summe((r) => {
        const g = kostenFuer(r.p.id, mz).nachGruppe;
        return [
          "running_cost",
          "other",
          "rent_to_owner",
          "financing_payment",
        ].reduce((s, k) => s + Number(g[k] ?? 0), 0);
      }),
    };
  });

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <Link href="/" className="text-sm text-gray-600 underline">
            ← Startseite
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">Dashboard</h1>
          <p className="text-sm text-gray-600">
            Zeitraum {zeitraumLabel(zeitraum)} · Auswertung nach Rechnungsdatum.
            Kautionen zählen nicht als Einnahme.
          </p>
        </header>

        <nav className="flex flex-wrap items-center gap-2">
          {[jahr - 2, jahr - 1, jahr, jahr + 1].map((j) => (
            <Link
              key={j}
              href={`/dashboard?jahr=${j}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                j === jahr
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-900 shadow"
              }`}
            >
              {j}
            </Link>
          ))}
          <span className="mx-2 text-gray-300">|</span>
          <Link
            href={`/dashboard?jahr=${jahr}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              !q && !m
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-900 shadow"
            }`}
          >
            ganzes Jahr
          </Link>
          {[1, 2, 3, 4].map((x) => (
            <Link
              key={x}
              href={`/dashboard?jahr=${jahr}&quartal=${x}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                q === x
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-900 shadow"
              }`}
            >
              Q{x}
            </Link>
          ))}
        </nav>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Portfolio · {beschriftung}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-gray-900">
            <div>
              <div className="text-sm text-gray-500">Einnahmen</div>
              <div className="text-xl font-medium">{eur(gesamt.einnahmen)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Kosten</div>
              <div className="text-xl font-medium">{eur(gesamt.kosten)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Cashflow</div>
              <div
                className={`text-xl font-medium ${
                  gesamt.cashflow < 0 ? "text-red-700" : "text-green-700"
                }`}
              >
                {eur(gesamt.cashflow)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Nettoertrag</div>
              <div className="text-xl font-medium">{eur(gesamt.nettoertrag)}</div>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-3">
            Nettorendite {pct(gesamtRendite.netto)} · Eigenkapitalrendite{" "}
            {pct(gesamtRendite.eigenkapital)}
          </p>
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Einnahmen und Kosten je Monat {jahr}
          </h2>
          <Chart werte={monatswerte} />
        </section>

        <section className="bg-white rounded-2xl shadow p-6 overflow-x-auto">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Übersicht je Immobilie · {beschriftung}
          </h2>
          {rows.length === 0 ? (
            <p className="text-gray-600">Noch keine Immobilie angelegt.</p>
          ) : (
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2">Immobilie</th>
                  <th className="py-2 text-right">Einnahmen</th>
                  <th className="py-2 text-right">Betriebsausgaben</th>
                  <th className="py-2 text-right">Hauptmiete</th>
                  <th className="py-2 text-right">Zins</th>
                  <th className="py-2 text-right">Tilgung</th>
                  <th className="py-2 text-right">Cashflow</th>
                  <th className="py-2 text-right">Nettoertrag</th>
                  <th className="py-2 text-right">Nettorendite</th>
                  <th className="py-2 text-right">EK-Rendite</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <Link href={`/immobilien/${r.p.id}`} className="underline">
                        {r.p.name}
                      </Link>
                    </td>
                    <td className="py-2 text-right">{eur(r.k.einnahmen)}</td>
                    <td className="py-2 text-right">
                      {eur(r.k.betriebsausgaben)}
                    </td>
                    <td className="py-2 text-right">{eur(r.k.hauptmiete)}</td>
                    <td className="py-2 text-right">
                      {eur(r.getrennt ? r.k.zins : r.k.zinsUndTilgung)}
                    </td>
                    <td className="py-2 text-right">
                      {eur(r.getrennt ? r.k.tilgung : 0)}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        r.k.cashflow < 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {eur(r.k.cashflow)}
                    </td>
                    <td className="py-2 text-right">{eur(r.k.nettoertrag)}</td>
                    <td className="py-2 text-right">{pct(r.rd.netto)}</td>
                    <td className="py-2 text-right">{pct(r.rd.eigenkapital)}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2">Portfolio</td>
                  <td className="py-2 text-right">{eur(gesamt.einnahmen)}</td>
                  <td className="py-2 text-right">
                    {eur(summe((r) => r.k.betriebsausgaben))}
                  </td>
                  <td className="py-2 text-right">
                    {eur(summe((r) => r.k.hauptmiete))}
                  </td>
                  <td className="py-2 text-right">{eur(summe((r) => r.k.zins))}</td>
                  <td className="py-2 text-right">
                    {eur(summe((r) => r.k.tilgung))}
                  </td>
                  <td className="py-2 text-right">{eur(gesamt.cashflow)}</td>
                  <td className="py-2 text-right">{eur(gesamt.nettoertrag)}</td>
                  <td className="py-2 text-right">{pct(gesamtRendite.netto)}</td>
                  <td className="py-2 text-right">
                    {pct(gesamtRendite.eigenkapital)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-3">
            Kosten nach Gruppe · {beschriftung}
          </h2>
          <ul className="divide-y divide-gray-100 text-gray-900">
            {Object.entries(
              rows.reduce<Record<string, number>>((acc, r) => {
                for (const [g, v] of Object.entries(r.kostenNachGruppe)) {
                  acc[g] = r2((acc[g] ?? 0) + v);
                }
                return acc;
              }, {})
            )
              .sort((a, b) => b[1] - a[1])
              .map(([g, v]) => (
                <li key={g} className="py-2 flex justify-between">
                  <span>{groupLabel[g as Group] ?? g}</span>
                  <span>{eur(v)}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
