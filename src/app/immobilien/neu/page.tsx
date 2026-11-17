export const instant = false;

import Link from "next/link";
import { immobilieAnlegen } from "../actions";
import ImmobilienFormular from "./formular";

export default async function NeueImmobilie(props: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await props.searchParams;

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <Link href="/" className="text-sm text-gray-600 underline">
            ← zurück zur Übersicht
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">
            Neues Objekt
          </h1>
        </header>

        {fehler && (
          <p className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
            {fehler}
          </p>
        )}

        <ImmobilienFormular aktion={immobilieAnlegen} />
      </div>
    </main>
  );
}
