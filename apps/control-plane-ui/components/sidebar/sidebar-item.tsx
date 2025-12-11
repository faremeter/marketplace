"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
}

export function SidebarItem({ href, icon, label }: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${
        isActive
          ? "bg-white/10 text-white"
          : "text-gray-11 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="h-4 w-4">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
