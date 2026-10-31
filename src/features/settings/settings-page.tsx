import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { FormSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { ProfileForm } from "./profile-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { T } from "@/lib/i18n/client";

async function SettingsContent() {
  const { profile } = await requireUser();
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle><T>Profile</T></CardTitle>
          <CardDescription><T>Your name is visible to your teacher on rosters and results.</T></CardDescription>
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
          <CardTitle><T>Password</T></CardTitle>
          <CardDescription><T>We&apos;ll email you a secure link to choose a new password.</T></CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/forgot-password"><T>Change password</T></Link>
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
