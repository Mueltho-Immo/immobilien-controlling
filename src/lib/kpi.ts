export type Group =
  | "running_cost"
  | "other"
  | "rent_to_owner"
  | "financing_payment"
  | "acquisition_cost";

export const groupLabel: Record<Group, string> = {
  running_cost: "Laufende Kosten",
  other: "Betriebsausgaben sonstiges",
  rent_to_owner: "Hauptmiete an Eigentümer",
  financing_payment: "Zins und Tilgung",
  acquisition_cost: "Anschaffungskosten",
};

/** Diese Gruppen sind echte Betriebsausgaben. */
const BETRIEB: Group[] = ["running_cost", "other"];

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function monthKey(y: number, m: number) {
  return y * 12 + (m - 1);
}

/** Ein Zeitraum in Tagen, beide Grenzen eingeschlossen. */
export type Zeitraum = { von: string; bis: string };

/** Liegt das Datum im Zeitraum? Textvergleich, das reicht bei ISO-Daten. */
export function imZeitraum(dateStr: string | null | undefined, z: Zeitraum) {
  return !!dateStr && dateStr >= z.von && dateStr <= z.bis;
}

/** Grenzen eines Quartals, Quartal 1 bis 4. */
export function quartal(y: number, q: number): Zeitraum {
  const start = (q - 1) * 3 + 1;
  const ende = start + 2;
  const letzter = new Date(Date.UTC(y, ende, 0)).getUTCDate();
  const mm = (m: number) => String(m).padStart(2, "0");
  return {
    von: `${y}-${mm(start)}-01`,
    bis: `${y}-${mm(ende)}-${letzter}`,
  };
}

/** Grenzen eines einzelnen Monats. */
export function monatZeitraum(y: number, m: number): Zeitraum {
  const letzter = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { von: `${y}-${mm}-01`, bis: `${y}-${mm}-${letzter}` };
}

/** Grenzen eines ganzen Jahres. */
export function jahrZeitraum(y: number): Zeitraum {
  return { von: `${y}-01-01`, bis: `${y}-12-31` };
}

/** Beschriftung wie 01.07.2026–30.09.2026. */
export function zeitraumLabel(z: Zeitraum) {
  const d = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  return `${d(z.von)}–${d(z.bis)}`;
}

export type Kennzahlen = {
  einnahmen: number;
  betriebsausgaben: number;
  hauptmiete: number;
  zinsUndTilgung: number;
  zins: number;
  tilgung: number;
  cashflow: number;
  nettoertrag: number;
};

/**
 * Cashflow    = Einnahmen - Betriebsausgaben - Hauptmiete - Zins - Tilgung
 * Nettoertrag = Einnahmen - Betriebsausgaben - Hauptmiete - Zins
 *
 * Der Unterschied ist die Tilgung: Geldabfluss, aber kein Aufwand.
 */
export function kennzahlen(input: {
  einnahmen: number;
  kostenNachGruppe: Record<string, number>;
  zins?: number;
  tilgung?: number;
}): Kennzahlen {
  const g = input.kostenNachGruppe;
  const sum = (k: Group) => r2(Number(g[k] ?? 0));

  const betriebsausgaben = r2(BETRIEB.reduce((s, k) => s + sum(k), 0));
  const hauptmiete = sum("rent_to_owner");
  const zinsUndTilgung = sum("financing_payment");

  // Ist der Zinsanteil erfasst, benutzen wir ihn. Sonst gilt der
  // konservative Fall: der ganze Betrag ist Zins.
  const hatZins = input.zins !== undefined;
  const zinsen = r2(
    hasZinsSafe(input.zins, zinsUndTilgung, input.tilgung)
  );
  const tilgung = r2(
    input.tilgung !== undefined
      ? Number(input.tilgung)
      : Math.max(0, zinsUndTilgung - zinsen)
  );

  return {
    einnahmen: r2(input.einnahmen),
    betriebsausgaben,
    hauptmiete,
    zinsUndTilgung,
    zins: zinsen,
    tilgung,
    cashflow: r2(
      input.einnahmen - betriebsausgaben - hauptmiete - zinsUndTilgung
    ),
    nettoertrag: r2(
      input.einnahmen -
        betriebsausgaben -
        hauptmiete -
        (hatZins ? zinsen : zinsUndTilgung)
    ),
  };
}

function hasZinsSafe(
  zins: number | undefined,
  zinsUndTilgung: number,
  tilgung: number | undefined
) {
  return zins !== undefined
    ? Number(zins)
    : Math.max(0, zinsUndTilgung - Number(tilgung ?? 0));
}

export function rendite(
  nettoertrag: number,
  kaufpreisMitNebenkosten: number,
  eigenkapital: number
) {
  return {
    netto:
      kaufpreisMitNebenkosten > 0
        ? r2((nettoertrag / kaufpreisMitNebenkosten) * 100)
        : 0,
    eigenkapital: eigenkapital > 1 ? r2((nettoertrag / eigenkapital) * 100) : 0,
  };
}

export function anschaffungskosten(p: {
  purchase_price?: number | null;
  acquisition_tax?: number | null;
  notary_costs?: number | null;
  other_acq_costs?: number | null;
}) {
  return r2(
    Number(p.purchase_price ?? 0) +
      Number(p.acquisition_tax ?? 0) +
      Number(p.notary_costs ?? 0) +
      Number(p.other_acq_costs ?? 0)
  );
}
