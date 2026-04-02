import Link from "next/link";
import Image from "next/image";
import { SITE_NAME, DOCS_URL, SUPPORT_URL } from "@/lib/brand";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5 bg-black">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center">
            <Image src="/logo.svg" alt={SITE_NAME} width={100} height={24} />
          </div>

          <nav className="flex items-center gap-6">
            <Link
              href={DOCS_URL}
              className="text-[13px] text-gray-9 transition-colors hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </Link>
            <Link
              href="https://github.com/faremeter/faremeter"
              className="text-[13px] text-gray-9 transition-colors hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
            {SUPPORT_URL && (
              <Link
                href={SUPPORT_URL}
                className="text-[13px] text-gray-9 transition-colors hover:text-white"
                target="_blank"
                rel="noopener noreferrer"
              >
                Support
              </Link>
            )}
          </nav>

          <p className="text-[13px] text-gray-9">
            &copy; {currentYear} {SITE_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
