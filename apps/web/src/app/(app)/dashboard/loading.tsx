import { CardSkeleton, StatTilesSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <StatTilesSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton className="h-56" />
        <CardSkeleton className="h-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton className="h-52" />
        <CardSkeleton className="h-52" />
      </div>
    </div>
  );
}
