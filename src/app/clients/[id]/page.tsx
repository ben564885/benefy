import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPrograms } from "@/lib/engine";
import { getChatHistory, getClient, getTrace } from "@/lib/store";
import ScreeningWorkspace from "@/components/ScreeningWorkspace";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getClient(id);
  if (!record) notFound();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs font-medium text-slate-500 hover:text-slate-700">
            ← Back home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Your benefits screening</h1>
          <p className="text-sm text-slate-500">{record.profile.zip_code ?? "No ZIP on file yet"}</p>
        </div>
      </div>

      <ScreeningWorkspace
        clientId={id}
        initialRecord={record}
        initialChat={getChatHistory(id)}
        initialTrace={getTrace(id)}
        programs={getAllPrograms()}
      />
    </main>
  );
}
