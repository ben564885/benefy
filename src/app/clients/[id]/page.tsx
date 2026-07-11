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
    <main className="mx-auto flex h-dvh w-full max-w-6xl flex-col px-6 pt-8 pb-6">
      <ScreeningWorkspace
        clientId={id}
        initialRecord={record}
        initialChat={await getChatHistory(id)}
        initialTrace={await getTrace(id)}
        programs={getAllPrograms()}
        header={
          <Link href="/" className="text-xs font-medium text-slate-500 hover:text-slate-700">
            ← Back home
          </Link>
        }
        signOut={<SignOutButton />}
      />
    </main>
  );
}
