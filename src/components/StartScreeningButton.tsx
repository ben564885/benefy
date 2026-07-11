"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-auth/browserClient";

function isClientDevWithoutSupabase(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

interface Props {
  className?: string;
  label?: string;
  loadingLabel?: string;
}

export default function StartScreeningButton({ className, label = "Check what I qualify for", loadingLabel = "Setting up…" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      if (isClientDevWithoutSupabase()) {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "You" }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Could not start screening session");
        }
        router.push(`/clients/${data.client.profile.client_id}`);
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
          "Supabase is not configured. Copy .env.example to .env.local, add your Supabase URL and anon key, then restart npm run dev.",
        );
      }

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
      if (!res.ok) {
        throw new Error(data.error ?? "Could not start screening session");
      }
      router.push(`/clients/${data.client.profile.client_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`cursor-pointer disabled:cursor-not-allowed ${className ?? ""}`}
      >
        {loading ? loadingLabel : label}
      </button>
      {error && <p className="max-w-xs text-center text-xs text-rose-200">{error}</p>}
    </div>
  );
}
