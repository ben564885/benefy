"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewScreeningButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/clients", { method: "POST", body: JSON.stringify({}) });
      const data = await res.json();
      router.push(`/clients/${data.client.profile.client_id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
    >
      {loading ? "Creating…" : "+ New Screening"}
    </button>
  );
}
