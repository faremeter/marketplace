"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Cross2Icon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface OpenApiExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
}

interface ExportResult {
  spec: unknown;
  warnings: string[];
  orphanEndpoints: { pattern: string; description: string | null }[];
  stats: {
    totalEndpoints: number;
    withLineage: number;
    orphans: number;
  };
}

export function OpenApiExportDialog({
  open,
  onOpenChange,
  tenantId,
}: OpenApiExportDialogProps) {
  const [includeOrphans, setIncludeOrphans] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState<ExportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setExportData(null);
      setIncludeOrphans(false);
      setCopied(false);
      return;
    }

    const fetchExport = async () => {
      setLoading(true);
      try {
        const result = await api.get<ExportResult>(
          `/api/tenants/${tenantId}/openapi/export?include_orphans=${includeOrphans}`,
        );
        setExportData(result);
      } catch {
        toast({
          title: "Failed to generate export",
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchExport();
  }, [open, tenantId, includeOrphans, toast]);

  const handleCopy = async () => {
    if (!exportData) return;

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(exportData.spec, null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        variant: "default",
      });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "error",
      });
    }
  };

  const handleDownload = () => {
    if (!exportData) return;

    const blob = new Blob([JSON.stringify(exportData.spec, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "openapi-spec.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded openapi-spec.json",
      variant: "default",
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Export OpenAPI Spec
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
            </div>
          ) : exportData ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-md border border-gray-6 bg-gray-3 p-4">
                <h4 className="mb-2 text-sm font-medium text-gray-12">
                  Export Summary
                </h4>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-11">
                    Total endpoints:{" "}
                    <span className="text-gray-12">
                      {exportData.stats.totalEndpoints}
                    </span>
                  </p>
                  <p className="text-green-400">
                    With lineage: {exportData.stats.withLineage} (will export
                    cleanly)
                  </p>
                  {exportData.stats.orphans > 0 && (
                    <p className="text-yellow-400">
                      Orphan endpoints: {exportData.stats.orphans}
                    </p>
                  )}
                </div>
              </div>

              {exportData.orphanEndpoints.length > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeOrphans}
                      onChange={(e) => setIncludeOrphans(e.target.checked)}
                      className="rounded border-gray-6"
                    />
                    <span className="text-sm text-gray-12">
                      Include orphan endpoints
                    </span>
                  </label>

                  <div className="flex items-start gap-2 rounded-md border border-yellow-800 bg-yellow-900/20 p-3">
                    <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-yellow-400" />
                    <div className="text-xs text-yellow-300">
                      <p className="font-medium mb-1">
                        Orphan endpoints have no OpenAPI lineage:
                      </p>
                      <ul className="space-y-0.5 font-mono">
                        {exportData.orphanEndpoints.slice(0, 5).map((ep, i) => (
                          <li key={i}>{ep.pattern}</li>
                        ))}
                        {exportData.orphanEndpoints.length > 5 && (
                          <li>
                            ... and {exportData.orphanEndpoints.length - 5} more
                          </li>
                        )}
                      </ul>
                      {includeOrphans && (
                        <p className="mt-2">
                          These will be marked with x-402-orphan extension.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {exportData.warnings.length > 0 && !includeOrphans && (
                <div className="rounded-md border border-gray-6 bg-gray-3 p-3">
                  <p className="mb-1 text-xs font-medium text-gray-11">
                    Warnings:
                  </p>
                  <ul className="space-y-0.5 text-xs text-gray-11">
                    {exportData.warnings.slice(0, 5).map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                    {exportData.warnings.length > 5 && (
                      <li>... and {exportData.warnings.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-11 hover:bg-gray-4 hover:text-gray-12"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm font-medium text-gray-12 hover:bg-gray-4"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-4 w-4 text-green-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Download
                </button>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
