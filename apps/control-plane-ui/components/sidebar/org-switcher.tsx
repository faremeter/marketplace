"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Avatar from "@radix-ui/react-avatar";
import { CheckIcon, PlusIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { useAuth, type Organization } from "@/lib/auth/context";
import { CreateOrgDialog } from "./create-org-dialog";

const MAX_ORGS_PER_USER = 5;

export function OrgSwitcher() {
  const { user, currentOrg, setCurrentOrg } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  if (!user || !user.organizations.length) {
    return null;
  }

  const orgInitial = currentOrg?.name.charAt(0).toUpperCase() ?? "?";
  const ownedOrgsCount = user.organizations.filter(
    (o) => o.role === "owner",
  ).length;
  const canCreateOrg = ownedOrgsCount < MAX_ORGS_PER_USER;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-left transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <OrgAvatar initial={orgInitial} />
            <span className="truncate text-[13px] font-semibold tracking-tight text-white">
              {currentOrg?.name ?? "Select organization"}
            </span>
          </div>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-gray-9" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[220px] max-w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-gray-2 p-1 shadow-lg"
          sideOffset={8}
          align="start"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-normal text-gray-9">
            Organizations
          </DropdownMenu.Label>

          {user.organizations.map((org) => (
            <OrgMenuItem
              key={org.id}
              org={org}
              isSelected={currentOrg?.id === org.id}
              onSelect={() => setCurrentOrg(org)}
            />
          ))}

          <DropdownMenu.Separator className="my-1 h-px bg-white/5" />

          <DropdownMenu.Item
            onSelect={() => canCreateOrg && setCreateDialogOpen(true)}
            disabled={!canCreateOrg}
            className={`flex items-center gap-2 rounded-xl px-2 py-2 text-[13px] font-semibold outline-none ${
              canCreateOrg
                ? "cursor-pointer text-gray-9 hover:bg-white/5 hover:text-white focus:bg-white/5"
                : "cursor-not-allowed text-gray-11 opacity-50"
            }`}
          >
            <div className="flex h-6 w-6 items-center justify-center">
              <PlusIcon className="h-4 w-4" />
            </div>
            <span>
              {canCreateOrg ? "Create Organization" : "Org limit reached"}
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </DropdownMenu.Root>
  );
}

function OrgAvatar({ initial }: { initial: string }) {
  return (
    <Avatar.Root className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-pink-500/20 to-purple-500/20">
      <Avatar.Fallback className="text-[11px] font-bold uppercase text-white">
        {initial}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}

function OrgMenuItem({
  org,
  isSelected,
  onSelect,
}: {
  org: Organization;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-2 text-[13px] outline-none hover:bg-white/5 focus:bg-white/5"
    >
      <div className="flex flex-1 items-center gap-2 overflow-hidden font-semibold">
        <OrgAvatar initial={org.name.charAt(0).toUpperCase()} />
        <span className="truncate tracking-tight text-white">{org.name}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-9">
          {org.role}
        </span>
      </div>
      {isSelected && <CheckIcon className="h-5 w-5 shrink-0 text-white" />}
    </DropdownMenu.Item>
  );
}
