"use client";

import { useFileStore } from "@/store/file-store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminUsersTab } from "@/components/admin/admin-users-tab";
import { AdminSystemTab } from "@/components/admin/admin-system-tab";
import { AdminDriversTab } from "@/components/admin/admin-drivers-tab";
import { Shield, Users, Activity, HardDrive } from "lucide-react";

export function AdminPanel() {
  const { adminPanelOpen, setAdminPanelOpen } = useFileStore();

  return (
    <Dialog open={adminPanelOpen} onOpenChange={setAdminPanelOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            Admin Panel
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="system" className="flex-1 min-h-0">
          <div className="px-6 pt-2 border-b">
            <TabsList className="bg-transparent h-10 p-0 gap-1">
              <TabsTrigger
                value="system"
                className="data-[state=active]:bg-emerald-600/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 rounded-md px-3 h-8 gap-1.5 text-sm"
              >
                <Activity className="w-3.5 h-3.5" />
                System
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="data-[state=active]:bg-emerald-600/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 rounded-md px-3 h-8 gap-1.5 text-sm"
              >
                <Users className="w-3.5 h-3.5" />
                Users
              </TabsTrigger>
              <TabsTrigger
                value="drivers"
                className="data-[state=active]:bg-emerald-600/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 rounded-md px-3 h-8 gap-1.5 text-sm"
              >
                <HardDrive className="w-3.5 h-3.5" />
                Storage
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-130px)]">
            <TabsContent value="system" className="mt-0">
              <AdminSystemTab />
            </TabsContent>
            <TabsContent value="users" className="mt-0">
              <AdminUsersTab />
            </TabsContent>
            <TabsContent value="drivers" className="mt-0">
              <AdminDriversTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
