"use client";

import { useEffect } from "react";

import { initSocket, disconnectSocket } from "@/lib/realtime/client";

type SocketLifecycleProviderProps = {
  children: React.ReactNode;
};

export function SocketLifecycleProvider({ children }: SocketLifecycleProviderProps) {
  useEffect(() => {
    initSocket();

    return () => {
      disconnectSocket();
    };
  }, []);

  return <>{children}</>;
}
