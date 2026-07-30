"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
