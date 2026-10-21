"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const baseClass =
  "flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] font-semibold transition-colors";
const activeClass = "bg-forest text-white hover:bg-forest-deep";
const inactiveClass = "text-ink hover:bg-white";

export function PrimaryNavLinks() {
  const pathname = usePathname();

  return (
    <>
      <NavLink href="/cars" pathname={pathname} className="px-1.5 sm:px-3">
        <span className="sm:hidden">Buy</span>
        <span className="hidden sm:inline">Buy a car</span>
      </NavLink>
      <NavLink href="/dealers" pathname={pathname} className="hidden px-3 sm:inline-flex">
        Dealers
      </NavLink>
      <NavLink href="/sell" pathname={pathname} className="px-2 sm:px-4">
        <span className="sm:hidden">Sell</span>
        <span className="hidden sm:inline">Sell a car</span>
      </NavLink>
    </>
  );
}

function NavLink({
  href,
  pathname,
  className,
  children,
}: {
  href: string;
  pathname: string;
  className?: string;
  children: ReactNode;
}) {
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${baseClass} ${className ?? ""} ${active ? activeClass : inactiveClass}`}
    >
      {children}
    </Link>
  );
}
