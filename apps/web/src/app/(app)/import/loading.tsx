import { PageHeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <div className="rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="mt-5 h-48 w-full rounded-lg" />
      </div>
    </div>
  );
}
