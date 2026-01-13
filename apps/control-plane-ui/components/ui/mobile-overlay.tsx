"use client";

import Image from "next/image";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

export function MobileOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black md:hidden">
      <div className="flex flex-col items-center px-6 text-center">
        <Image
          src="/corbits-wordmark-orange.svg"
          alt="Corbits"
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
      <a
        href="https://t.me/+r80b_8WkFJ45NjM5"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-8 inline-flex items-center gap-1.5 text-sm text-gray-11 hover:text-gray-12"
      >
        Chat with us on Telegram
        <ExternalLinkIcon className="h-3 w-3" />
      </a>
    </div>
  );
}
