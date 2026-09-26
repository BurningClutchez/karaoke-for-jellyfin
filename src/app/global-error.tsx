"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

// Replaces the root layout when it fails, so it must render <html> itself
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body>
        <ErrorScreen
          error={error}
          title="Something went wrong"
          detail="The problem has been reported. Reloading usually fixes it."
          actionLabel="Reload"
          onAction={() => window.location.reload()}
        />
      </body>
    </html>
  );
}
