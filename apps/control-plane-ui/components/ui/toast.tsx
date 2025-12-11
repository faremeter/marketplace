"use client";

import { createContext, useContext, useState, useCallback } from "react";
import * as Toast from "@radix-ui/react-toast";
import { Cross2Icon, CheckCircledIcon } from "@radix-ui/react-icons";

interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error";
}

interface ToastContextValue {
  toast: (data: Omit<ToastData, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((data: Omit<ToastData, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...data, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <Toast.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <Toast.Root
            key={t.id}
            open={true}
            onOpenChange={(open) => !open && removeToast(t.id)}
            duration={4000}
            className={`rounded-lg border p-4 shadow-lg backdrop-blur-sm ${
              t.variant === "success"
                ? "border-green-800/50 bg-green-900/40"
                : t.variant === "error"
                  ? "border-red-800/50 bg-red-900/40"
                  : "border-gray-6/50 bg-gray-2/40"
            }`}
          >
            <div className="flex items-start gap-3">
              {t.variant === "success" && (
                <CheckCircledIcon className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <Toast.Title className="text-sm font-medium text-gray-12">
                  {t.title}
                </Toast.Title>
                {t.description && (
                  <Toast.Description className="mt-1 text-sm text-gray-11">
                    {t.description}
                  </Toast.Description>
                )}
              </div>
              <Toast.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
                <Cross2Icon className="h-4 w-4" />
              </Toast.Close>
            </div>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[480px] max-w-[calc(100vw-2rem)]" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}
