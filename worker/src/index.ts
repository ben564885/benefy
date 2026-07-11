import { chromium } from "playwright";
import { claimNextSubmission, markStatus, type SubmissionRow } from "./lib/queue.js";
import { saveArtifact } from "./lib/storage.js";
import { fetchApplicantData } from "./lib/applicantData.js";
import { getAdapter } from "./adapters/registry.js";
import type { ScreenshotArtifact } from "./adapters/types.js";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);

async function uploadScreenshots(
  clientId: string,
  submissionId: string,
  screenshots: ScreenshotArtifact[],
): Promise<{ kind: "screenshot"; label: string; url: string; created_at: string }[]> {
  const out = [];
  for (let i = 0; i < screenshots.length; i++) {
    const s = screenshots[i];
    const url = await saveArtifact(clientId, submissionId, `${i}-${s.label}.png`, s.buffer, "image/png");
    out.push({ kind: "screenshot" as const, label: s.label, url, created_at: new Date().toISOString() });
  }
  return out;
}

// Anything written to a submission's `error` is rendered verbatim to the
// applicant in ApplyPanel's "Needs your attention" block — write for them,
// not for us. No program_ids, no adapter internals, no exception text.
// Reaching this at all means a row was enqueued for a program with no
// usable adapter (e.g. a row queued before the program moved to "assisted"),
// which the apply API route is supposed to prevent.
const NO_AUTOMATION_MESSAGE =
  "This program can't be applied for automatically — use the prefilled draft and submit it yourself.";

async function processPdfJob(row: SubmissionRow): Promise<void> {
  const adapter = getAdapter(row.program_id);
  if (!adapter || adapter.kind !== "pdf_fill") {
    await markStatus(row.id, "needs_human", { error: NO_AUTOMATION_MESSAGE });
    return;
  }
  if (!adapter.verified) {
    await markStatus(row.id, "needs_human", {
      error: "This program's PDF automation hasn't been verified yet — use the prefilled draft and fill the official form by hand.",
    });
    return;
  }
  await markStatus(row.id, "filling");
  try {
    const data = await fetchApplicantData(row.client_id, row.program_id);
    const { pdfBytes, unfillable, receiptNote } = await adapter.fill(data);
    const url = await saveArtifact(
      row.client_id,
      row.id,
      "application.pdf",
      Buffer.from(pdfBytes),
      "application/pdf",
    );
    const artifacts = [{ kind: "pdf" as const, label: "Completed application PDF", url, created_at: new Date().toISOString() }];
    if (unfillable.length > 0) {
      await markStatus(row.id, "needs_human", {
        error: `Could not fill: ${unfillable.join(", ")}`,
        newArtifacts: artifacts,
      });
    } else {
      await markStatus(row.id, "submitted", {
        receipt_note:
          receiptNote ?? "PDF generated — download, review, sign, and submit per the program's own instructions.",
        newArtifacts: artifacts,
      });
    }
  } catch (err) {
    console.error(`submission ${row.id} (${row.program_id}) pdf_fill job threw`, err);
    await markStatus(row.id, "failed", {
      error: "Something went wrong filling this out automatically. Use the official form and apply yourself instead.",
    });
  }
}

async function processWebJob(row: SubmissionRow): Promise<void> {
  const adapter = getAdapter(row.program_id);
  if (!adapter || adapter.kind !== "web_submit") {
    await markStatus(row.id, "needs_human", { error: NO_AUTOMATION_MESSAGE });
    return;
  }

  // status "submitting" means the human already confirmed a prior dry run —
  // this pass performs the real submit. Anything else claimable ("queued")
  // is the first, dry-run pass.
  const commit = row.status === "submitting";

  if (commit && !adapter.verified) {
    await markStatus(row.id, "needs_human", {
      error: "This program's automation hasn't been verified against the live site yet — apply directly using the prefilled draft instead.",
    });
    return;
  }

  await markStatus(row.id, commit ? "submitting" : "filling");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const data = await fetchApplicantData(row.client_id, row.program_id);
    const result = await adapter.fillAndMaybeSubmit(page, data, commit);
    const artifacts = await uploadScreenshots(row.client_id, row.id, result.screenshots);

    if (result.unfillable.length > 0) {
      await markStatus(row.id, "needs_human", {
        error: `Form requires information we don't have: ${result.unfillable.join(", ")}`,
        newArtifacts: artifacts,
      });
    } else if (commit) {
      await markStatus(row.id, "submitted", {
        receipt_note: result.receiptNote ?? "Submitted.",
        newArtifacts: artifacts,
      });
    } else {
      await markStatus(row.id, "awaiting_review", { newArtifacts: artifacts });
    }
  } catch (err) {
    console.error(`submission ${row.id} (${row.program_id}) web_submit job threw`, err);
    await markStatus(row.id, "failed", {
      error: "Something went wrong filling this out automatically. Use the official form and apply yourself instead.",
    });
  } finally {
    await browser.close();
  }
}

async function processOne(row: SubmissionRow): Promise<void> {
  if (row.apply_mode === "pdf_fill") {
    await processPdfJob(row);
  } else if (row.apply_mode === "web_submit") {
    await processWebJob(row);
  } else {
    // "assisted" rows should never be enqueued (the apply API route only
    // enqueues web_submit/pdf_fill programs), but fail closed if one shows up.
    await markStatus(row.id, "needs_human", { error: "This program has no automated apply path." });
  }
}

async function loop(): Promise<void> {
  console.log("benefy-apply-worker started, polling every", POLL_INTERVAL_MS, "ms");
  for (;;) {
    let row: SubmissionRow | null = null;
    try {
      row = await claimNextSubmission();
    } catch (err) {
      console.error("claimNextSubmission failed", err);
    }
    if (row) {
      console.log(`claimed submission ${row.id} (${row.program_id}, status=${row.status})`);
      try {
        await processOne(row);
      } catch (err) {
        console.error(`submission ${row.id} failed`, err);
        await markStatus(row.id, "failed", {
          error: "Something went wrong filling this out automatically. Use the official form and apply yourself instead.",
        }).catch(() => {});
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

loop();
