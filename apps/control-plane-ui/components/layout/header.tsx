"use client";

import Link from "next/link";
import Image from "next/image";
import { SITE_NAME } from "@/lib/brand";
import { useAuth } from "@/lib/auth/context";

export function Header() {
  const { user } = useAuth();

  return (
    <header className="border-b border-white/5 bg-black/50 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Image
            src="/corbits-wordmark-orange.svg"
            alt={SITE_NAME}
            width={100}
            height={24}
            priority
          />
        </Link>

        <nav className="flex items-center gap-1">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-gray-11 transition-colors hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
