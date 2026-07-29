"use client";

import { SessionProvider as SP } from "next-auth/react";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <SP>{children}</SP>;
}
