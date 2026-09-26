"use client";

import { QRCode } from "@/components/tv/QRCode";

/** "Scan to join" QR code in the TV's top-right corner */
export function JoinQRCode() {
  return (
    <div className="absolute top-16 right-4 z-40">
      <div className="text-center">
        <QRCode
          url={
            typeof window !== "undefined"
              ? window.location.origin
              : "http://localhost:3000"
          }
          size={80}
          className="opacity-60 hover:opacity-100 transition-opacity duration-300"
        />
        <div className="text-xs text-gray-400 mt-1 opacity-60">
          Scan to join
        </div>
      </div>
    </div>
  );
}
