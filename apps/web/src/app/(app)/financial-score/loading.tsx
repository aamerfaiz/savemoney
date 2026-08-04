import {
  PageHeaderSkeleton,
  CardSkeleton,
  CardGridSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <CardSkeleton className="h-44" />
      <CardGridSkeleton count={4} className="sm:grid-cols-1" />
    </div>
  );
}
