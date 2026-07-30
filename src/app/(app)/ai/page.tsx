import { AiAssistantView } from "@/components/ai/ai-assistant-view";
import { ConnectProviderPrompt } from "@/components/ai/connect-provider-prompt";
import { hasActiveProviderKey } from "@/lib/ai/queries";

export const metadata = { title: "AI Assistant · Finance OS" };

export default async function AiPage() {
  const connected = await hasActiveProviderKey();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          AI Assistant
        </h1>
        <p className="text-sm text-muted-foreground">
          Bring your own key — ask questions about your money, in plain
          language.
        </p>
      </div>

      {connected ? <AiAssistantView /> : <ConnectProviderPrompt />}
    </div>
  );
}
