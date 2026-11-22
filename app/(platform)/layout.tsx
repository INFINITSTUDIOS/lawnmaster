import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/"><Logo /></Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:text-brand">Log in</Link>
            <Link href="/signup" className="btn">Start free</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-100 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} LawnMaster
      </footer>
    </>
  );
}
