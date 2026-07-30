import { ImportWizard } from "@/components/import/import-wizard";
import { ImportHistory } from "@/components/import/import-history";
import { getImportHistory } from "@/lib/import/queries";

export const metadata = { title: "Import · Finance OS" };

export default async function ImportPage() {
  const batches = await getImportHistory();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          Import
        </h1>
        <p className="text-sm text-muted-foreground">
          Bring in transactions from a CSV — with duplicate detection and undo.
        </p>
      </div>

      <ImportWizard />
      <ImportHistory batches={batches} />
    </div>
  );
}
