"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactElement<{ className?: string }>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  const iconEl = isValidElement(icon)
    ? cloneElement(icon, {
        className: `h-[17px] w-[17px] shrink-0 ${active ? "text-white" : "text-[#8B9AC0]"}`,
      })
    : icon;

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-2.5 py-2.5 text-sm font-medium transition ${
        active ? "bg-primary text-white" : "text-[#CBD5E1] hover:text-white"
      }`}
    >
      {iconEl}
      {children}
    </Link>
  );
}
