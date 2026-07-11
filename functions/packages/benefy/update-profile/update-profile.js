// DO Function relay for the Intake agent's `update_client_profile` tool.
// This is the real callable function registered on the agent (see
// GRADIENT_SETUP.md §1). It forwards flat scalar args to Benefy's own
// deployed API, which runs the actual persistence logic — the deterministic
// engine and client store live once, in the Next.js app, not duplicated here.

async function main(args) {
  const baseUrl = process.env.BENEFY_APP_URL;
  const secret = process.env.FUNCTIONS_SHARED_SECRET;

  const res = await fetch(`${baseUrl}/api/functions/update-profile`, {
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
