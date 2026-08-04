import {
  PageHeaderSkeleton,
  RowsSkeleton,
  StatTilesSkeleton,
} from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={3} className="grid-cols-3" />
      <Skeleton className="h-10 w-full rounded-md" />
      <RowsSkeleton rows={6} />
    </div>
  );
}
