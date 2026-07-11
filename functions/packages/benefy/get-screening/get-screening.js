// DO Function relay for the Navigator agent's `get_screening_result` tool —
// lets the Navigator re-fetch the actual computed verdict instead of trusting
// anything said earlier in the conversation. See GRADIENT_SETUP.md §1.

async function main(args) {
  const baseUrl = process.env.BENEFY_APP_URL;
  const secret = process.env.FUNCTIONS_SHARED_SECRET;

  const res = await fetch(`${baseUrl}/api/functions/get-screening`, {
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
