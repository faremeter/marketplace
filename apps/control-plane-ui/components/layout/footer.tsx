import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5 bg-black">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-white">
              Corbits API
            </span>
          </div>

          <nav className="flex items-center gap-6">
            <Link
              href="https://docs.corbits.dev"
              className="text-[13px] text-gray-9 transition-colors hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </Link>
            <Link
              href="https://github.com/abklabs"
              className="text-[13px] text-gray-9 transition-colors hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
            <Link
              href="mailto:support@corbits.dev"
              className="text-[13px] text-gray-9 transition-colors hover:text-white"
            >
              Support
            </Link>
          </nav>

          <p className="text-[13px] text-gray-9">{currentYear} Corbits</p>
        </div>
      </div>
    </footer>
  );
}
