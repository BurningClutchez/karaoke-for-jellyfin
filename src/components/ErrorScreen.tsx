"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientLog";

interface ErrorScreenProps {
  error: Error & { digest?: string };
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}

/** Shared screen for the error boundaries; reports the error once */
export function ErrorScreen({
  error,
  title,
  detail,
  actionLabel,
  onAction,
}: ErrorScreenProps) {
  useEffect(() => {
    reportClientError(
      "error",
      `Page crashed: ${error.message}${error.digest ? ` (${error.digest})` : ""}`,
      error.stack
    );
  }, [error]);

  return (
    <div
      data-testid="error-screen"
      className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-gray-400">{detail}</p>
      <button
        onClick={onAction}
        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500"
      >
        {actionLabel}
      </button>
    </div>
  );
}
