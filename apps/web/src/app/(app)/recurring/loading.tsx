import {
  PageHeaderSkeleton,
  StatTilesSkeleton,
  RowsSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={3} className="grid-cols-3" />
      <RowsSkeleton rows={6} />
    </div>
  );
}
