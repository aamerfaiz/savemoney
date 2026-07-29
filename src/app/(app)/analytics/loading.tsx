import { CardSkeleton, PageHeaderSkeleton, StatTilesSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
      <CardSkeleton className="h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton className="h-60" />
        <CardSkeleton className="h-60" />
      </div>
    </div>
  );
}
