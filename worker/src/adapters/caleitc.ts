import { PDFDocument } from "pdf-lib";
import type { ApplicantData, PdfAdapter, PdfFillOutcome } from "./types.js";

// FTB Form 3514 (California Earned Income Tax Credit). The field NAMES in
// this AcroForm are opaque generator codes ("3514_Form_1000", ...), so the
// safe fields below were mapped positionally on 2026-07-11: every field was
// filled with its own id, the page was rendered, and each id was read off
// the printed form by eye (see worker/README.md "How caleitc was verified").
// The map is therefore observed, not guessed.
//
// What we fill — only identity/dependent data the profile actually holds:
//   Name(s) as shown on return, and the Part III qualifying-child columns
//   (first name, last name, date of birth, relationship) for up to 3 kids.
// What we deliberately leave BLANK for the filer to complete by hand:
//   - every SSN/ITIN box (taxpayer's and each child's) — same reason we
//     never auto-sign: identity data the person adds and verifies themselves.
//   - the calculation lines (federal AGI, federal EIC, investment income,
//     California earned income, the credit itself) — these come off the
//     filed federal/California return, not from a screening profile, and a
//     wrong number on a perjury-signed tax form is the exact failure mode
//     worth refusing. The filer or their preparer completes these.
//   - the Part I "previously disallowed" questions and the 9a/9b
//     student/disability questions — we can't determine these truthfully.
// receiptNote spells all of this out to the user.

const PDF_URL = "https://www.ftb.ca.gov/forms/2025/2025-3514.pdf";

// The tax year of the form at PDF_URL. The positional field-id map below is
// specific to this revision — when FTB posts a new year's 3514, re-run the
// worker/README audit against it and move BOTH of these together.
const TAX_YEAR = 2025;

const NAME_FIELD = "3514_Form_1000";

// Qualifying-child columns, left to right (Child 1/2/3). Verified against the
// rendered form — do not reorder without re-rendering.
const CHILD_COLUMNS: { first: string; last: string; dob: string; relationship: string }[] = [
  { first: "3514_Form_1008", last: "3514_Form_1009", dob: "3514_Form_1011", relationship: "3514_Form_1014" },
  { first: "3514_Form_1016", last: "3514_Form_1017", dob: "3514_Form_1019", relationship: "3514_Form_1022" },
  { first: "3514_Form_1024", last: "3514_Form_1025", dob: "3514_Form_1027", relationship: "3514_Form_1030" },
];

// CA EITC qualifying-child relationships: son/daughter/stepchild/foster
// child, sibling (incl. half/step), or a descendant of any of them
// (grandchild, niece, nephew). Matched loosely against our free-text
// relationship string; anything else (spouse, parent, self, roommate) is
// left for the filer to add by hand.
const CHILD_RELATIONSHIP = /child|son|daughter|brother|sister|sibling|niece|nephew|foster/i;

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

// "1993-04-17" (or any Date-parseable string) -> "04/17/1993". Returns "" if
// unparseable so a bad value is left blank rather than guessed.
function formatDob(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function ageAtYearEnd(iso: string | null, year: number): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return year - d.getFullYear();
}

function titleCase(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export const caleitcAdapter: PdfAdapter = {
  kind: "pdf_fill",
  programId: "caleitc",
  verified: true,

  async fill(data: ApplicantData): Promise<PdfFillOutcome> {
    const p = data.profile;
    const res = await fetch(PDF_URL);
    if (!res.ok) throw new Error(`Failed to fetch FTB 3514 PDF: ${res.status}`);
    const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    const form = doc.getForm();

    form.getTextField(NAME_FIELD).setText(p.legal_name ?? p.display_name ?? "");

    // Clear qualifying children: child-like relationship AND, when we know an
    // age, 18-or-under at the end of the tax year. Older students (19-23) and
    // any-age disabled dependents can also qualify but need facts we can't
    // verify, so the receiptNote asks the filer to add those by hand. Cap at
    // the form's three columns.
    const children = p.household_members
      .filter((m) => m.relationship && CHILD_RELATIONSHIP.test(m.relationship))
      .filter((m) => {
        const age = ageAtYearEnd(m.date_of_birth, TAX_YEAR);
        return age === null || age <= 18;
      })
      .slice(0, CHILD_COLUMNS.length);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const col = CHILD_COLUMNS[i];
      const { first, last } = splitName(child.full_name);
      form.getTextField(col.first).setText(first);
      form.getTextField(col.last).setText(last);
      form.getTextField(col.dob).setText(formatDob(child.date_of_birth));
      if (child.relationship) form.getTextField(col.relationship).setText(titleCase(child.relationship));
    }

    const pdfBytes = await doc.save();
    return {
      pdfBytes,
      unfillable: [],
      receiptNote:
        "We pre-filled your name" +
        (children.length > 0
          ? ` and ${children.length} qualifying ${children.length === 1 ? "child" : "children"}`
          : "") +
        " on FTB Form 3514. Before filing: add your SSN and each child's SSN, answer the Part I eligibility " +
        "questions, and complete the income/credit lines from your federal and California returns (or have a tax " +
        "preparer do it). If you have a child age 19–23 who was a full-time student, or any age and permanently " +
        "disabled, add them too. This form isn't filed on its own — attach it to your California Form 540, sign, and file.",
    };
  },
};
