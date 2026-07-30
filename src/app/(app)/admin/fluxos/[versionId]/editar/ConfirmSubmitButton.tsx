"use client";

import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
  disabled,
}: {
  confirmMessage: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
