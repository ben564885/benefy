"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-auth/browserClient";

// Matches the Supabase project's "Email OTP length" setting — see
// supabase/email-otp-template.html for the paired email template.
const OTP_LENGTH = 8;

interface Props {
  next: string;
}

export default function LoginForm({ next }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;

      if (next === "start") {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "You" }),
        });
        const data = await res.json();
        router.push(`/clients/${data.client.profile.client_id}`);
      } else {
        router.push(next);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {step === "email" ? "Sign in to Benefy" : "Enter your code"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {step === "email"
            ? "No password needed — we'll email you a one-time code."
            : `We sent an ${OTP_LENGTH}-digit code to ${email}.`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleSendCode} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={OTP_LENGTH}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
            placeholder={"0".repeat(OTP_LENGTH)}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={loading || code.length !== OTP_LENGTH}
            className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
