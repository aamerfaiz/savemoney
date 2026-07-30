import {
  PageHeaderSkeleton,
  CardSkeleton,
  CardGridSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <CardSkeleton className="h-64" />
      <CardGridSkeleton count={2} className="sm:grid-cols-2" />
    </div>
  );
}
