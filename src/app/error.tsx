"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      error={error}
      title="Something went wrong"
      detail="The problem has been reported. Your place in the queue is safe."
      actionLabel="Try again"
      onAction={reset}
    />
  );
}
