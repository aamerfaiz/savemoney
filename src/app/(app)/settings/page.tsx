import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/settings/profile-form";
import { getProfile } from "@/lib/profile/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Settings · Finance OS" };

export default async function SettingsPage() {
  const profile = await getProfile();

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

      {!isSupabaseConfigured() && (
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Demo mode — sign in with Supabase configured to save your settings.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>
    </div>
  );
}
