// DO Function relay for the Intake agent's `check_eligibility` tool — the
// centerpiece of the architecture. This is the only function the platform
// lets the model invoke to get an eligibility verdict; the verdict itself is
// computed by the deterministic engine behind Benefy's own API, never by
// the model. See GRADIENT_SETUP.md §1.

async function main(args) {
  const baseUrl = process.env.BENEFY_APP_URL;
  const secret = process.env.FUNCTIONS_SHARED_SECRET;

  const res = await fetch(`${baseUrl}/api/functions/check-eligibility`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(args),
  });

  const data = await res.json();
  if (!res.ok) {
    return { body: { error: data.error || `upstream error ${res.status}` } };
  }
  return { body: data };
}

exports.main = main;
