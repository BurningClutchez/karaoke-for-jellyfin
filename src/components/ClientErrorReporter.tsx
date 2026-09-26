"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientLog";

/** Sends uncaught browser errors to the server log */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      reportClientError("error", event.message, event.error?.stack);
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportClientError(
        "error",
        `Unhandled rejection: ${reason?.message ?? String(reason)}`,
        reason?.stack
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
