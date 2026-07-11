"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-auth/browserClient";

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
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?next=start");
        return;
      }

      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "You" }),
      });
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
