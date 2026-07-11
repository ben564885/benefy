import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOwnedClient } from "@/lib/auth";
import { getAllPrograms } from "@/lib/engine";
import { getChatHistory, getTrace } from "@/lib/store";
import ScreeningWorkspace from "@/components/ScreeningWorkspace";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    if (owned.status === 401) redirect(`/login?next=/clients/${id}`);
    notFound();
  }
  const record = owned.record;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-6xl flex-col gap-6 px-6 pt-10 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs font-medium text-slate-500 hover:text-slate-700">
            ← Back home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Your benefits screening</h1>
          <p className="text-sm text-slate-500">{record.profile.zip_code ?? "No ZIP on file yet"}</p>
        </div>
        <SignOutButton />
      </div>

      <ScreeningWorkspace
        clientId={id}
        initialRecord={record}
        initialChat={await getChatHistory(id)}
        initialTrace={await getTrace(id)}
        programs={getAllPrograms()}
      />
    </main>
  );
}
