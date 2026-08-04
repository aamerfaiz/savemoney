import { PageHeaderSkeleton, CardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeaderSkeleton />
      <CardSkeleton className="h-56" />
    </div>
  );
}
