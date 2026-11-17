"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function anmelden(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setMeldung(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: passwort,
    });

    setLaeuft(false);

    if (error) {
      setMeldung("Anmeldung fehlgeschlagen: " + error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={anmelden}
        className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4"
      >
        <h1 className="text-2xl font-semibold text-gray-900">
          Immobilien-Controlling
        </h1>
        <p className="text-sm text-gray-600">Bitte melden Sie sich an.</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            E-Mail
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Passwort
          </label>
          <input
            type="password"
            required
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
          />
        </div>

        {meldung && <p className="text-sm text-red-600">{meldung}</p>}

        <button
          type="submit"
          disabled={laeuft}
          className="w-full rounded-lg bg-gray-900 text-white py-2 font-medium disabled:opacity-50"
        >
          {laeuft ? "Anmeldung läuft…" : "Anmelden"}
        </button>

        <p className="text-xs text-gray-500">
          Neue Konten werden von der Verwaltung eingeladen.
        </p>
      </form>
    </main>
  );
}
