import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeaderSkeleton />
      <RowsSkeleton rows={6} />
    </div>
  );
}
