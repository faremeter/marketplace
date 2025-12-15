"use client";

import * as Separator from "@radix-ui/react-separator";
import {
  DashboardIcon,
  LayersIcon,
  Link2Icon,
  GearIcon,
  ShadowOuterIcon,
} from "@radix-ui/react-icons";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { SidebarItem } from "./sidebar-item";

export function UserSidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-white/5 bg-black">
      <div className="p-4">
        <OrgSwitcher />
      </div>

      <Separator.Root className="h-px bg-white/5" />

      <nav className="flex-1 space-y-1 p-4">
        <SidebarItem
          href="/dashboard"
          icon={<DashboardIcon />}
          label="Dashboard"
        />
        <SidebarItem href="/proxies" icon={<LayersIcon />} label="Proxies" />
        <SidebarItem href="/endpoints" icon={<Link2Icon />} label="Endpoints" />
        <SidebarItem
          href="/wallets"
          icon={
            <span className="relative inline-flex items-center justify-center">
              <ShadowOuterIcon />
              <span className="absolute text-[7px] font-bold">$</span>
            </span>
          }
          label="Wallets"
        />
        <SidebarItem href="/settings" icon={<GearIcon />} label="Settings" />
      </nav>

      <Separator.Root className="h-px bg-white/5" />

      <div className="p-4">
        <UserMenu />
      </div>
    </aside>
  );
}
