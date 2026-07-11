import Link from "next/link";
import { caseloadTotal, listClients } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import NewScreeningButton from "@/components/NewScreeningButton";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    screened: "bg-emerald-100 text-emerald-800 border-emerald-200",
    not_screened: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const label = status === "screened" ? "Screened" : "Not yet screened";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status]}`}>
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const clients = listClients();
  const total = caseloadTotal();
  const screenedCount = clients.filter((c) => c.last_screening).length;
  const needsReviewCount = clients.reduce(
    (sum, c) => sum + (c.last_screening?.needs_review_count ?? 0),
    0,
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Benefy</p>
        <h1 className="text-2xl font-semibold text-slate-900">Caseload dashboard</h1>
        <p className="text-sm text-slate-500">
          Deterministic benefits screening for San Francisco caseworkers, guided by a Gradient AI intake &amp;
          navigator agent pair.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Total benefits surfaced</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">{formatMoney(total)}</p>
          <p className="mt-1 text-xs text-slate-400">annual, across likely-eligible programs only</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Clients screened</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {screenedCount} <span className="text-lg font-normal text-slate-400">/ {clients.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Needs review</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{needsReviewCount}</p>
          <p className="mt-1 text-xs text-slate-400">program screens awaiting caseworker follow-up</p>
        </div>
      </section>

      <section className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Caseload</h2>
        <NewScreeningButton />
      </section>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Estimated annual value</th>
              <th className="px-5 py-3 font-medium">Needs review</th>
              <th className="px-5 py-3 font-medium">Last screened</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((record) => (
              <tr key={record.profile.client_id} className="hover:bg-slate-50">
                <td className="px-5 py-4 font-medium text-slate-900">{record.profile.display_name}</td>
                <td className="px-5 py-4">{statusBadge(record.last_screening ? "screened" : "not_screened")}</td>
                <td className="px-5 py-4 text-slate-700">
                  {record.last_screening ? formatMoney(record.last_screening.total_estimated_annual_value) : "—"}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {record.last_screening && record.last_screening.needs_review_count > 0 ? (
                    <span className="font-medium text-amber-600">{record.last_screening.needs_review_count}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-5 py-4 text-slate-500">
                  {record.profile.last_screened_at
                    ? new Date(record.profile.last_screened_at).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/clients/${record.profile.client_id}`}
                    className="font-medium text-teal-700 hover:text-teal-900"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
