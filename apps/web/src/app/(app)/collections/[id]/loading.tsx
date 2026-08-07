import { CardSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <CardSkeleton className="h-28" />
      <CardSkeleton className="h-28" />
      <CardSkeleton className="h-48" />
    </div>
  );
}
