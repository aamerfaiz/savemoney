import {
  PageHeaderSkeleton,
  StatTilesSkeleton,
  CardSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={4} className="grid-cols-2 sm:grid-cols-4" />
      <CardSkeleton className="h-64" />
      <CardSkeleton className="h-48" />
    </div>
  );
}
