"use client";

import { useState } from "react";

function Feld(props: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  inputMode?: "decimal" | "text";
  vorgabe?: string;
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
        defaultValue={props.vorgabe}
        placeholder={
          props.inputMode === "decimal" ? "z. B. 1200 oder 1.200,50" : undefined
        }
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
      />
    </div>
  );
}

export default function ImmobilienFormular(props: {
  aktion: (formData: FormData) => void | Promise<void>;
}) {
  const [art, setArt] = useState<"zwischenmiete" | "eigentum">("zwischenmiete");

  return (
    <form
      action={props.aktion}
      className="bg-white rounded-2xl shadow p-6 space-y-5"
    >
      <input type="hidden" name="nutzungsart" value={art} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Art des Objekts
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setArt("zwischenmiete")}
            className={
              "rounded-lg border px-4 py-3 text-left text-sm " +
              (art === "zwischenmiete"
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white text-gray-700")
            }
          >
            <span className="block font-medium">Angemietet</span>
            <span className="block text-xs opacity-80">
              Ich miete und vermiete weiter
            </span>
          </button>
          <button
            type="button"
            onClick={() => setArt("eigentum")}
            className={
              "rounded-lg border px-4 py-3 text-left text-sm " +
              (art === "eigentum"
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white text-gray-700")
            }
          >
            <span className="block font-medium">Gekauft</span>
            <span className="block text-xs opacity-80">
              Ich besitze und vermiete
            </span>
          </button>
        </div>
      </div>

      <hr className="border-gray-200" />

      <Feld name="name" label="Bezeichnung" required />
      <Feld name="street" label="Straße und Hausnummer" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Feld name="postal_code" label="Postleitzahl" />
        <Feld name="city" label="Ort" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Feld
          name="purchase_date"
          label={art === "eigentum" ? "Kaufdatum" : "Beginn des Mietvertrags"}
          type="date"
        />
        <Feld
          name="living_area_sqm"
          label="Wohnfläche in m²"
          inputMode="decimal"
        />
      </div>

      {art === "zwischenmiete" && (
        <>
          <hr className="border-gray-200" />
          <h2 className="text-base font-medium text-gray-900">
            Hauptmiete an den Eigentümer
          </h2>
          <Feld name="eigentuemer" label="Eigentümer (Name)" />
          <Feld
            name="eigentuemer_kontakt"
            label="Kontakt (Telefon oder E-Mail)"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Feld
              name="hauptmiete"
              label="Hauptmiete in Euro"
              inputMode="decimal"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zahlungsweise
              </label>
              <select
                name="hauptmiete_intervall"
                defaultValue="monatlich"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="monatlich">monatlich</option>
                <option value="vierteljaehrlich">vierteljährlich</option>
                <option value="jaehrlich">jährlich</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Feld
              name="nebenkostenvorauszahlung"
              label="Nebenkostenvorauszahlung an Eigentümer"
              inputMode="decimal"
            />
            <Feld name="kaution" label="Kaution in Euro" inputMode="decimal" />
          </div>
        </>
      )}

      {art === "eigentum" && (
        <>
          <hr className="border-gray-200" />
          <h2 className="text-base font-medium text-gray-900">Kauf</h2>
          <Feld
            name="purchase_price"
            label="Kaufpreis in Euro"
            inputMode="decimal"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Feld
              name="acquisition_tax"
              label="Grunderwerbsteuer in Euro"
              inputMode="decimal"
            />
            <Feld
              name="notary_costs"
              label="Notar und Grundbuch in Euro"
              inputMode="decimal"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Feld
              name="other_acq_costs"
              label="Sonstige Anschaffungskosten"
              inputMode="decimal"
            />
            <Feld
              name="equity"
              label="Eigenkapital in Euro"
              inputMode="decimal"
            />
          </div>
          <Feld
            name="current_value"
            label="Aktueller Wert in Euro"
            inputMode="decimal"
          />
        </>
      )}

      <button
        type="submit"
        className="w-full rounded-lg bg-gray-900 text-white py-2 font-medium"
      >
        Objekt speichern
      </button>
    </form>
  );
}
