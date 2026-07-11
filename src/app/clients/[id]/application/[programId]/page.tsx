import Link from "next/link";
import { notFound } from "next/navigation";
import { buildPrefill } from "@/lib/applicationPrefill";
import { getClient } from "@/lib/store";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string; programId: string }>;
}) {
  const { id, programId } = await params;
  const record = getClient(id);
  if (!record) notFound();

  const outcome = buildPrefill(id, programId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="print:hidden">
        <Link href={`/clients/${id}`} className="text-xs font-medium text-slate-500 hover:text-slate-700">
          ← Back to {record.profile.display_name}
        </Link>
      </div>

      {!outcome.ok ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
          {outcome.error}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                {outcome.data.label}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{outcome.data.form_name}</h1>
              <p className="text-sm text-slate-500">
                Official application:{" "}
                <a href={outcome.data.form_url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
                  {outcome.data.form_url}
                </a>
              </p>
            </div>
            <PrintButton />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">{outcome.data.program_name} — pre-filled fields</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {outcome.data.fields.map((f) => (
                <div key={f.form_field} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">{f.form_field}</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">{f.value || <span className="text-slate-400">—</span>}</dd>
                </div>
              ))}
            </dl>
          </div>

          {outcome.data.required_documents.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Documents the client will need</h2>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                {outcome.data.required_documents.map((doc) => (
                  <li key={doc}>{doc}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-slate-400">
            Generated {new Date(outcome.data.generated_at).toLocaleString()} · This is a draft pre-fill only. Benefy
            does not submit applications electronically — the caseworker must review and submit through the official
            channel above.
          </p>
        </div>
      )}
    </main>
  );
}
