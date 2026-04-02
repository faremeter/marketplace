"use client";

import { SALES_EMAIL, SUPPORT_URL } from "@/lib/brand";
import * as Separator from "@radix-ui/react-separator";
import {
  DashboardIcon,
  LayersIcon,
  Link2Icon,
  GearIcon,
  ShadowOuterIcon,
  ExternalLinkIcon,
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

      <div className="px-4 pb-6">
        {SUPPORT_URL && (
          <div className="mb-4 flex items-center gap-1 px-3">
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-corbits-orange hover:underline"
            >
              Support
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>
        )}
        <div className="flex items-center gap-1 px-3">
          <p className="text-xs text-gray-11">Need more?</p>
          <a
            href={`mailto:${SALES_EMAIL}`}
            className="text-xs text-corbits-orange hover:underline"
          >
            Contact Sales
          </a>
        </div>
      </div>

      <div className="p-4">
        <UserMenu />
      </div>
    </aside>
  );
}
