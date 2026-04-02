"use client";

import Image from "next/image";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { SITE_NAME, SUPPORT_URL } from "@/lib/brand";

export function MobileOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black md:hidden">
      <div className="flex flex-col items-center px-6 text-center">
        <Image
          src="/logo.svg"
          alt={SITE_NAME}
          width={160}
          height={40}
          className="mb-8"
        />
        <h1 className="text-2xl font-semibold text-gray-12">
          Coming Soon on Mobile
        </h1>
        <p className="mt-3 text-sm text-gray-11">
          To view this page, open it on desktop.
        </p>
      </div>
      {SUPPORT_URL && (
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-8 inline-flex items-center gap-1.5 text-sm text-gray-11 hover:text-gray-12"
        >
          Support
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
