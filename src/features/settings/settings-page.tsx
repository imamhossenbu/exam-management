import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { ProfileForm } from "./profile-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";

async function SettingsContent() {
  const { profile } = await requireUser();
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name is visible to your teacher on rosters and results.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            fullName={profile.full_name}
            timezone={profile.timezone}
            email={profile.email}
            studentClass={profile.student_class}
            phone={profile.phone}
            avatarUrl={profile.avatar_url}
            role={profile.role}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>We&apos;ll email you a secure link to choose a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/forgot-password">Change password</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile and preferences." />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
