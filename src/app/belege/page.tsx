import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "./upload-form";

function groesse(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default async function Belege() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: belege, error } = await supabase
    .from("documents")
    .select("id, original_name, mime_type, size_bytes, status, created_at, storage_path")
    .order("created_at", { ascending: false });

  const links = new Map<string, string>();
  if (belege && belege.length > 0) {
    const { data: signed } = await supabase.storage
      .from("belege")
      .createSignedUrls(
        belege.map((b) => b.storage_path),
        600
      );
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
    });
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <Link href="/" className="text-sm text-gray-600 underline">
            ← zurück zur Übersicht
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">Belege</h1>
        </header>

        <section className="bg-white rounded-2xl shadow p-6">
          <UploadForm />
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Hochgeladene Belege
          </h2>

          {error && (
            <p className="text-sm text-red-600">
              Fehler beim Laden: {error.message}
            </p>
          )}

          {!error && (!belege || belege.length === 0) && (
            <p className="text-sm text-gray-600">Noch keine Belege vorhanden.</p>
          )}

          {belege && belege.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {belege.map((b) => {
                const url = links.get(b.storage_path);
                return (
                  <li key={b.id} className="py-3 flex justify-between gap-4">
                    <span>
                      <span className="block font-medium text-gray-900 break-all">
                        {url ? (
                          <a href={url} target="_blank" className="underline">
                            {b.original_name}
                          </a>
                        ) : (
                          b.original_name
                        )}
                      </span>
                      <span className="block text-sm text-gray-600">
                        {new Date(b.created_at).toLocaleDateString("de-DE")} ·{" "}
                        {groesse(b.size_bytes)}
                      </span>
                    </span>
                                        <span className="flex items-center gap-3 whitespace-nowrap">
                      <span className="text-sm text-gray-700">
                        {b.status === "uploaded" ? "Neu" : b.status}
                      </span>
                      <Link
                        href={`/belege/${b.id}`}
                        className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-medium text-gray-900"
                      >
                        Buchen
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
