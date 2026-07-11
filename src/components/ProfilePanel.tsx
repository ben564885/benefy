import type { ClientProfile } from "@/lib/types";

interface FieldSpec {
  label: string;
  value: string | null;
  captured: boolean;
}

function buildFields(profile: ClientProfile): FieldSpec[] {
  const income =
    profile.monthly_income_gross != null
      ? `$${profile.monthly_income_gross.toLocaleString()}/mo`
      : profile.annual_income_gross != null
        ? `$${profile.annual_income_gross.toLocaleString()}/yr`
        : null;

  return [
    { label: "Household size", value: profile.household_size?.toString() ?? null, captured: profile.household_size != null },
    { label: "Gross income", value: income, captured: income != null },
    { label: "SF resident", value: profile.sf_resident == null ? null : profile.sf_resident ? "Yes" : "No", captured: profile.sf_resident != null },
    {
      label: "Immigration status",
      value: profile.immigration_status,
      captured: profile.immigration_status != null,
    },
    { label: "Senior (65+)", value: profile.has_senior == null ? null : profile.has_senior ? "Yes" : "No", captured: profile.has_senior != null },
    {
      label: "Has disability",
      value: profile.has_disability == null ? null : profile.has_disability ? "Yes" : "No",
      captured: profile.has_disability != null,
    },
    {
      label: "Current programs",
      value: profile.current_programs.length ? profile.current_programs.join(", ") : "None reported",
      captured: true,
    },
    { label: "ZIP code", value: profile.zip_code, captured: profile.zip_code != null },
  ];
}

export default function ProfilePanel({ profile, readyToScreen }: { profile: ClientProfile; readyToScreen: boolean }) {
  const fields = buildFields(profile);
  const capturedCount = fields.filter((f) => f.captured).length;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Client profile</h3>
        <p className="mt-1 text-xs text-slate-500">
          {capturedCount}/{fields.length} fields captured
          {readyToScreen ? " — ready to screen" : " — still missing required fields"}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-600 transition-all"
            style={{ width: `${(capturedCount / fields.length) * 100}%` }}
          />
        </div>
      </div>
      <dl className="flex flex-col gap-2.5 text-sm">
        {fields.map((f) => (
          <div key={f.label} className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{f.label}</dt>
            <dd
              className={
                f.captured
                  ? "font-medium text-slate-900"
                  : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
              }
            >
              {f.captured ? f.value : "missing"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
