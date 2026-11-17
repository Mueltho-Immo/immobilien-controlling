import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { zahlungBuchen } from "./actions";
import { zahlungStornieren } from "./storno";

export const instant = false;

const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const r2 = (n: number) => Math.round(n * 100) / 100;

function monthKey(y: number, m: number) {
  return y * 12 + (m - 1);
}

function shift(y: number, m: number, d: number) {
  const k = monthKey(y, m) + d;
  return { y: Math.floor(k / 12), m: (k % 12) + 1 };
}

type Suchparameter = { monat?: string; fehler?: string };

export default async function Mieten(props: {
  searchParams: Promise<Suchparameter>;
}) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const [py, pm] = (sp.monat ?? "").split("-").map(Number);
  const gueltig = Array.isArray(py) || (py && pm >= 1 && pm <= 12);
  const year = gueltig ? py : now.getFullYear();
  const month = gueltig ? pm : now.getMonth() + 1;
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);
  const label = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);
  const back = `/mieten?monat=${label(year, month)}`;

  const [
    { data: tenancies },
    { data: units },
    { data: tenants },
    { data: changes },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("tenancies")
      .select(
        "id, unit_id, tenant_id, start_date, end_date, cold_rent, service_charge_advance, status"
      ),
    supabase.from("units").select("id, label, target_rent, property_id"),
    supabase.from("tenants").select("id, name"),
    supabase
      .from("rent_changes")
      .select("tenancy_id, valid_from, cold_rent, service_charge_advance"),
    supabase
      .from("rent_payments")
      .select("id, tenancy_id, year, month, amount, kind, paid_date, notes")
      .order("created_at"),
  ]);

  const unitMap = new Map((units ?? []).map((u) => [u.id, u.label]));
  const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  const sollFor = (
    t: NonNullable<typeof tenancies>[number],
    y: number,
    m: number
  ) => {
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const last = `${y}-${String(m).padStart(2, "0")}-31`;
    if (t.start_date > last) return 0;
    if (t.end_date && t.end_date < first) return 0;

    let cold = Number(t.cold_rent ?? 0);
    let adv = Number(t.service_charge_advance ?? 0);
    const ch = (changes ?? [])
      .filter((c) => c.tenancy_id === t.id && c.valid_from <= last)
      .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
    if (ch) {
      cold = Number(ch.cold_rent ?? cold);
      adv = Number(ch.service_charge_advance ?? adv);
    }
    return r2(cold + adv);
  };

  const aktiv = (tenancies ?? []).filter(
    (t) => t.status !== "beendet" && t.status !== "ended"
  );

  const rows = aktiv.map((t) => {
    const soll = sollFor(t, year, month);
    const monatszahlungen = (payments ?? []).filter(
      (p) => p.tenancy_id === t.id && p.year === year && p.month === month
    );
    const ist = r2(
      monatszahlungen.reduce((s, p) => s + Number(p.amount ?? 0), 0)
    );

    const sy = Number(t.start_date.slice(0, 4));
    const sm = Number(t.start_date.slice(5, 7));
    let sollGes = 0;
    for (let k = monthKey(sy, sm); k <= monthKey(year, month); k++) {
      sollGes += sollFor(t, Math.floor(k / 12), (k % 12) + 1);
    }
    const istGes = (payments ?? [])
      .filter(
        (p) =>
          p.tenancy_id === t.id && monthKey(p.year, p.month) <= monthKey(year, month)
      )
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const offen = r2(soll - ist);
    const rueckstand = r2(sollGes - istGes);
    let status = "offen";
    if (soll === 0) status = "kein Soll";
    else if (ist >= soll) status = "bezahlt";
    else if (ist > 0) status = "teilweise";

    return {
      t,
      monatszahlungen,
      unit: unitMap.get(t.unit_id) ?? "?",
      mieter: tenantMap.get(t.tenant_id) ?? "?",
      soll,
      ist,
      offen,
      rueckstand,
      status,
    };
  });

  const summe = rows.reduce(
    (a, r) => ({ soll: a.soll + r.soll, ist: a.ist + r.ist }),
    { soll: 0, ist: 0 }
  );

  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = `${year}-${String(month).padStart(2, "0")}-31`;
  const belegt = new Set(
    (tenancies ?? [])
      .filter((t) => t.start_date <= last && (!t.end_date || t.end_date >= first))
      .map((t) => t.unit_id)
  );
  const leer = (units ?? []).filter((u) => !belegt.has(u.id));
  const entgangen = leer.reduce((s, u) => s + Number(u.target_rent ?? 0), 0);

  const farbe: Record<string, string> = {
    bezahlt: "bg-green-100 text-green-800",
    teilweise: "bg-yellow-100 text-yellow-800",
    offen: "bg-red-100 text-red-800",
    "kein Soll": "bg-gray-100 text-gray-600",
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <Link href="/" className="text-sm text-gray-600 underline">
            ← Startseite
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">Mieten</h1>
          <div className="flex items-center gap-4 mt-2 text-gray-900">
            <Link className="underline" href={`/mieten?monat=${label(prev.y, prev.m)}`}>
              ←
            </Link>
            <span className="font-medium">
              {String(month).padStart(2, "0")}/{year}
            </span>
            <Link className="underline" href={`/mieten?monat=${label(next.y, next.m)}`}>
              →
            </Link>
          </div>
        </header>

        {sp.fehler && (
          <p className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">
            {sp.fehler}
          </p>
        )}

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-1">
            Soll-Ist-Vergleich
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Soll {eur(summe.soll)} · Eingegangen {eur(summe.ist)} · Offen{" "}
            {eur(r2(summe.soll - summe.ist))}
          </p>

          {rows.length === 0 && (
            <p className="text-gray-600">Keine aktiven Mietverhältnisse.</p>
          )}

          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.t.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{r.unit}</div>
                    <div className="text-sm text-gray-600">{r.mieter}</div>
                  </div>
                  <span
                    className={`self-start text-xs px-2 py-1 rounded-full ${farbe[r.status]}`}
                  >
                    {r.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm mt-3 text-gray-900">
                  <div>
                    <div className="text-gray-500">Soll</div>
                    {eur(r.soll)}
                  </div>
                  <div>
                    <div className="text-gray-500">Ist</div>
                    {eur(r.ist)}
                  </div>
                  <div>
                    <div className="text-gray-500">Offen</div>
                    {eur(r.offen)}
                  </div>
                </div>

                {r.monatszahlungen.length > 0 && (
                  <ul className="mt-3 text-sm text-gray-900 divide-y divide-gray-100">
                    {r.monatszahlungen.map((p) => (
                      <li
                        key={p.id}
                        className="py-1 flex items-center justify-between gap-2"
                      >
                        <span>
                          {p.paid_date} · {p.kind} · {eur(Number(p.amount))}
                          {p.notes ? ` · ${p.notes}` : ""}
                        </span>
                        {Number(p.amount) > 0 &&
                          !(payments ?? []).some(
                            (q) => q.notes === `Storno ${p.id}`
                          ) && (
                            <form action={zahlungStornieren}>
                              <input
                                type="hidden"
                                name="payment_id"
                                value={p.id}
                              />
                              <input type="hidden" name="back" value={back} />
                              <button className="text-xs text-red-700 underline">
                                stornieren
                              </button>
                            </form>
                          )}
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  action={zahlungBuchen}
                  className="mt-3 flex flex-wrap gap-2 items-end"
                >
                  <input type="hidden" name="tenancy_id" value={r.t.id} />
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="month" value={month} />
                  <div>
                    <label className="block text-xs text-gray-600">
                      Betrag (€)
                    </label>
                    <input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={
                        r.offen > 0 ? String(r.offen).replace(".", ",") : ""
                      }
                      className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Datum</label>
                    <input
                      type="date"
                      name="paid_date"
                      defaultValue={today}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-gray-900"
                    />
                  </div>
                  <input
                    name="notes"
                    placeholder="Notiz (optional)"
                    className="flex-1 min-w-32 rounded-lg border border-gray-300 px-2 py-1 text-gray-900"
                  />
                  <button className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm">
                    Zahlung buchen
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-3">
            Offene Posten (Rückstand gesamt)
          </h2>
          {rows.filter((r) => r.rueckstand > 0).length === 0 ? (
            <p className="text-gray-600">
              Keine Rückstände bis Ende dieses Monats.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 text-gray-900">
              {rows
                .filter((r) => r.rueckstand > 0)
                .map((r) => (
                  <li key={r.t.id} className="py-2 flex justify-between">
                    <span>
                      {r.mieter} · {r.unit}
                    </span>
                    <span className="font-medium text-red-700">
                      {eur(r.rueckstand)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-3">Leerstand</h2>
          {leer.length === 0 ? (
            <p className="text-gray-600">
              Alle Einheiten sind in diesem Monat vermietet.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 text-gray-900">
                {leer.map((u) => (
                  <li key={u.id} className="py-2 flex justify-between">
                    <span>{u.label}</span>
                    <span>{eur(Number(u.target_rent ?? 0))}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 mt-3">
                Entgangene Soll-Miete in diesem Monat: {eur(entgangen)}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
