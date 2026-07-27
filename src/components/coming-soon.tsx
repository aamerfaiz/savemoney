import { Construction } from "lucide-react";

import { Card } from "@/components/ui/card";

/** Placeholder for Phase 1+ modules that are routed but not yet built out. */
export function ComingSoon({
  title,
  phase = "Phase 1",
  description,
}: {
  title: string;
  phase?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-xl font-semibold tracking-tight lg:text-2xl">
        {title}
      </h1>
      <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Construction className="size-7" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">{title} is on the roadmap</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {description ??
              `The ${title} module is scaffolded and coming in ${phase}.`}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {phase}
        </span>
      </Card>
    </div>
  );
}
