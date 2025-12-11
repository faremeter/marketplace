"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Avatar from "@radix-ui/react-avatar";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials = user.email.split("@")[0].slice(0, 2).toUpperCase();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-white/5 focus:outline-none">
          <Avatar.Root className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
            <Avatar.Fallback className="text-[12px] font-medium text-white">
              {initials}
            </Avatar.Fallback>
          </Avatar.Root>
          <span className="hidden text-[13px] text-gray-11 sm:inline">
            {user.email}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[180px] rounded-md border border-white/10 bg-gray-2 p-1 shadow-lg"
          sideOffset={5}
          align="end"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[11px] text-gray-9">
            {user.email}
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-white/5" />

          {user.is_admin && (
            <>
              <DropdownMenu.Item asChild>
                <Link
                  href="/admin"
                  className="flex cursor-pointer items-center rounded px-2 py-1.5 text-[13px] text-white outline-none hover:bg-white/10 focus:bg-white/10"
                >
                  Admin Dashboard
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-white/5" />
            </>
          )}

          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-[13px] text-white outline-none hover:bg-white/10 focus:bg-white/10"
            >
              Settings
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-white/5" />

          <DropdownMenu.Item
            onSelect={() => logout()}
            className="flex cursor-pointer items-center rounded px-2 py-1.5 text-[13px] text-red-400 outline-none hover:bg-white/10 focus:bg-white/10"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
