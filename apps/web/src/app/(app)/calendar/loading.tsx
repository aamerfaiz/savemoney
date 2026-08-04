import {
  PageHeaderSkeleton,
  StatTilesSkeleton,
  CardSkeleton,
  RowsSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={2} className="grid-cols-2" />
      <CardSkeleton className="h-72" />
      <RowsSkeleton rows={4} />
    </div>
  );
}
