"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CourseDetailTabs({
  students,
  invites,
  taxonomy,
  exams,
  counts,
}: {
  students: React.ReactNode;
  invites: React.ReactNode;
  taxonomy: React.ReactNode;
  exams: React.ReactNode;
  counts: { students: number; invites: number; subjects: number; exams: number };
}) {
  return (
    <Tabs defaultValue="students" className="space-y-4">
      <div className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="students">Students ({counts.students})</TabsTrigger>
          <TabsTrigger value="invites">Invitations ({counts.invites})</TabsTrigger>
          <TabsTrigger value="taxonomy">Subjects ({counts.subjects})</TabsTrigger>
          <TabsTrigger value="exams">Exams ({counts.exams})</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="students">{students}</TabsContent>
      <TabsContent value="invites">{invites}</TabsContent>
      <TabsContent value="taxonomy">{taxonomy}</TabsContent>
      <TabsContent value="exams">{exams}</TabsContent>
    </Tabs>
  );
}
