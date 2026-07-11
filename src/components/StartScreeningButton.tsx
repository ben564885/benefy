"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  className?: string;
  label?: string;
  loadingLabel?: string;
}

export default function StartScreeningButton({ className, label = "Check what I qualify for", loadingLabel = "Setting up…" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/clients", { method: "POST", body: JSON.stringify({ display_name: "You" }) });
      const data = await res.json();
      router.push(`/clients/${data.client.profile.client_id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? loadingLabel : label}
    </button>
  );
}
