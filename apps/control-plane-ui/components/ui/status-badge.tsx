"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import {
  getTenantStatus,
  type TenantStatusInput,
  type StatusDisplay,
} from "@/lib/tenant-status";

interface StatusBadgeProps {
  tenant?: TenantStatusInput;
  status?: StatusDisplay;
  size?: "sm" | "md";
}

export function StatusBadge({ tenant, status, size = "sm" }: StatusBadgeProps) {
  const displayStatus = status ?? (tenant ? getTenantStatus(tenant) : null);

  if (!displayStatus) {
    return null;
  }

  const sizeClasses =
    size === "md" ? "px-2.5 py-1 text-xs font-medium" : "px-2 py-0.5 text-xs";

  const badge = (
    <span
      className={`relative inline-flex items-center leading-none rounded-full border ${sizeClasses} ${displayStatus.color} ${displayStatus.pulse ? "animate-pulse" : ""}`}
      style={
        displayStatus.pingColor
          ? {
              animation: "subtle-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
            }
          : undefined
      }
    >
      {displayStatus.label}
      {displayStatus.pingColor && (
        <style>{`
          @keyframes subtle-ping {
            0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.35); }
            100% { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
          }
        `}</style>
      )}
    </span>
  );

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="cursor-help">{badge}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded-md bg-gray-1 px-3 py-2 text-xs text-gray-11 shadow-lg border border-gray-6"
            sideOffset={5}
          >
            {displayStatus.tooltip}
            <Tooltip.Arrow className="fill-gray-1" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
