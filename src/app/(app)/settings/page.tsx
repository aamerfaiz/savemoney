import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/settings/profile-form";
import { AiProviderSettings } from "@/components/settings/ai-provider-settings";
import { VaultSettings } from "@/components/settings/vault-settings";
import { AgentAccessSettings } from "@/components/settings/agent-access-settings";
import { getProfile } from "@/lib/profile/queries";
import { listProviderKeys } from "@/lib/ai/queries";
import { getVaultSetupStatus, listMcpTokens } from "@/lib/vault/queries";

export const metadata = { title: "Settings · Finance OS" };

export default async function SettingsPage() {
  const [profile, providerKeys, vaultStatus, mcpTokens] = await Promise.all([
    getProfile(),
    listProviderKeys(),
    getVaultSetupStatus(),
    listMcpTokens(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Your profile and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card id="ai">
        <CardHeader>
          <CardTitle>AI & Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <AiProviderSettings keys={providerKeys} />
        </CardContent>
      </Card>

      <Card id="vault">
        <CardHeader>
          <CardTitle>Vault & Encryption</CardTitle>
        </CardHeader>
        <CardContent>
          <VaultSettings hasVault={vaultStatus.hasVault} />
        </CardContent>
      </Card>

      <Card id="agent-access">
        <CardHeader>
          <CardTitle>Agent Access</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentAccessSettings tokens={mcpTokens} />
        </CardContent>
      </Card>
    </div>
  );
}
