"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Avatar from "@radix-ui/react-avatar";
import {
  GearIcon,
  ExitIcon,
  LockClosedIcon,
  DotsHorizontalIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials = user.email.split("@")[0].slice(0, 2).toUpperCase();
  const emailName = user.email.split("@")[0];
  const emailDomain = user.email.split("@")[1];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5 focus:outline-none">
          <Avatar.Root className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20">
            <Avatar.Fallback className="text-[11px] font-bold uppercase text-white">
              {initials}
            </Avatar.Fallback>
          </Avatar.Root>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-[13px] font-medium text-white">
              {emailName}
            </p>
            <p className="truncate text-[11px] text-gray-9">@{emailDomain}</p>
          </div>
          <DotsHorizontalIcon className="h-4 w-4 shrink-0 text-gray-9" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] overflow-hidden rounded-xl border border-white/10 bg-gray-2 p-1 shadow-xl shadow-black/20"
          sideOffset={8}
          align="start"
          side="top"
        >
          {user.is_admin && (
            <>
              <DropdownMenu.Item asChild>
                <Link
                  href="/admin"
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-gray-11 outline-none transition-colors hover:bg-white/5 hover:text-white focus:bg-white/5"
                >
                  <LockClosedIcon className="h-4 w-4" />
                  Admin Dashboard
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-white/5" />
            </>
          )}

          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-gray-11 outline-none transition-colors hover:bg-white/5 hover:text-white focus:bg-white/5"
            >
              <GearIcon className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-white/5" />

          <DropdownMenu.Item
            onSelect={() => logout()}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-red-400 outline-none transition-colors hover:bg-red-500/10 focus:bg-red-500/10"
          >
            <ExitIcon className="h-4 w-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
