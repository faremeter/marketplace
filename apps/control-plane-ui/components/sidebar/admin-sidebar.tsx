"use client";

import * as Separator from "@radix-ui/react-separator";
import {
  DashboardIcon,
  PersonIcon,
  HomeIcon,
  LayersIcon,
  CubeIcon,
  FileTextIcon,
  GearIcon,
  ExitIcon,
  Link2Icon,
  ShadowOuterIcon,
} from "@radix-ui/react-icons";
import { UserMenu } from "./user-menu";
import { SidebarItem } from "./sidebar-item";

export function AdminSidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-white/5 bg-black">
      <div className="p-4">
        <h1 className="text-[15px] font-medium text-white">Admin Panel</h1>
        <p className="text-[12px] text-gray-9">Corbits API</p>
      </div>

      <Separator.Root className="h-px bg-white/5" />

      <nav className="flex-1 space-y-1 p-4">
        <SidebarItem href="/admin" icon={<DashboardIcon />} label="Dashboard" />
        <SidebarItem href="/admin/users" icon={<PersonIcon />} label="Users" />
        <SidebarItem
          href="/admin/organizations"
          icon={<HomeIcon />}
          label="Organizations"
        />
        <SidebarItem href="/admin/nodes" icon={<CubeIcon />} label="Nodes" />
        <SidebarItem
          href="/admin/tenants"
          icon={<LayersIcon />}
          label="Tenants"
        />
        <SidebarItem
          href="/admin/endpoints"
          icon={<Link2Icon />}
          label="Endpoints"
        />
        <SidebarItem
          href="/admin/wallets"
          icon={
            <span className="relative inline-flex items-center justify-center">
              <ShadowOuterIcon />
              <span className="absolute text-[7px] font-bold">$</span>
            </span>
          }
          label="Wallets"
        />
        <SidebarItem
          href="/admin/transactions"
          icon={<FileTextIcon />}
          label="Transactions"
        />
        <SidebarItem
          href="/admin/settings"
          icon={<GearIcon />}
          label="Settings"
        />
      </nav>

      <Separator.Root className="h-px bg-white/5" />

      <div className="p-4">
        <SidebarItem href="/proxies" icon={<ExitIcon />} label="Exit Admin" />
      </div>

      <Separator.Root className="h-px bg-white/5" />

      <div className="p-4">
        <UserMenu />
      </div>
    </aside>
  );
}
