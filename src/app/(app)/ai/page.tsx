import { AiShell } from "@/components/ai/ai-shell";
import { ConnectProviderPrompt } from "@/components/ai/connect-provider-prompt";
import { hasActiveProviderKey } from "@/lib/ai/queries";
import { loadReferenceData } from "@/lib/ai/capabilities/shared";

export const metadata = { title: "AI Assistant · Finance OS" };

export default async function AiPage() {
  const connected = await hasActiveProviderKey();
  const reference = connected ? await loadReferenceData() : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          AI Assistant
        </h1>
        <p className="text-sm text-muted-foreground">
          Bring your own key — ask questions or add entries, in plain
          language.
        </p>
      </div>

      {connected && reference ? <AiShell reference={reference} /> : <ConnectProviderPrompt />}
    </div>
  );
}
