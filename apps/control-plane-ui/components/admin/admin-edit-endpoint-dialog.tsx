"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon, PlusIcon, MinusIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { SCHEME_OPTIONS } from "@/lib/types/api";
import { TagsInput } from "@/components/shared/tags-input";

interface Endpoint {
  id: number;
  tenant_id: number;
  path: string | null;
  path_pattern: string;
  price_usdc: number | null;
  scheme: string | null;
  description: string | null;
  priority: number;
  openapi_source_paths: string[] | null;
  is_active: boolean;
  tags: string[];
  created_at: string;
}

interface AdminEditEndpointDialogProps {
  endpoint: Endpoint;
  tenantId: number;
  defaultPriceUsdc: number;
  defaultScheme: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminEditEndpointDialog({
  endpoint,
  tenantId,
  defaultPriceUsdc,
  defaultScheme,
  onClose,
  onSuccess,
}: AdminEditEndpointDialogProps) {
  const [path, setPath] = useState(endpoint.path ?? endpoint.path_pattern);
  const [priceUsdc, setPriceUsdc] = useState(
    endpoint.price_usdc !== null
      ? (endpoint.price_usdc / 1000000).toString()
      : (defaultPriceUsdc / 1000000).toString(),
  );
  const [scheme, setScheme] = useState(endpoint.scheme ?? defaultScheme);
  const [description, setDescription] = useState(endpoint.description ?? "");
  const [priority, setPriority] = useState(endpoint.priority.toString());
  const [tags, setTags] = useState<string[]>(endpoint.tags ?? []);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      await api.put(`/api/admin/tenants/${tenantId}/endpoints/${endpoint.id}`, {
        path: path.trim(),
        price_usdc: priceUsdc
          ? Math.round(parseFloat(priceUsdc) * 1000000)
          : null,
        scheme: scheme || null,
        description: description.trim() || null,
        priority: parseInt(priority) || 100,
        tags,
      });

      toast({
        title: "Endpoint updated",
        variant: "default",
      });

      onSuccess();
    } catch {
      toast({
        title: "Failed to update endpoint",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Edit Endpoint
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-11">
                Path
              </label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm text-gray-12 font-mono placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                required
              />
              <p className="mt-1 text-xs text-gray-9">
                example: /api/users or /api/users/{"{id}"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Price
                </label>
                <div className="flex items-center gap-0 rounded-md border border-gray-6 bg-gray-3">
                  <button
                    type="button"
                    onClick={() => {
                      const val = Math.max(
                        0,
                        parseFloat(priceUsdc || "0") - 0.001,
                      );
                      setPriceUsdc(
                        val === 0 ? "0" : val.toFixed(6).replace(/\.?0+$/, ""),
                      );
                    }}
                    className="flex h-9 w-9 items-center justify-center text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors rounded-l-md"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <div className="flex flex-1 items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={priceUsdc}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setPriceUsdc(val);
                        }
                      }}
                      placeholder="0.001"
                      className="w-full bg-transparent py-2 text-center text-sm text-gray-12 placeholder-gray-9 focus:outline-none"
                    />
                    <span className="pr-2 text-xs text-gray-11">USDC</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseFloat(priceUsdc || "0") + 0.001;
                      setPriceUsdc(val.toFixed(6).replace(/\.?0+$/, ""));
                    }}
                    className="flex h-9 w-9 items-center justify-center text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors rounded-r-md"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Scheme
                </label>
                <select
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-6 bg-gray-3 px-3 text-sm text-gray-12 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                >
                  {SCHEME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-11">
                Priority
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                min="1"
                className="mt-1 w-full rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
              />
              <p className="mt-0.5 text-xs text-gray-11">
                Lower numbers are evaluated first
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-11">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1 w-full rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-11">
                Tags
              </label>
              <div className="mt-1">
                <TagsInput tags={tags} onChange={setTags} />
              </div>
            </div>

            {endpoint.openapi_source_paths &&
              endpoint.openapi_source_paths.length > 0 && (
                <div className="rounded-md border border-gray-6 bg-gray-3 p-3">
                  <p className="mb-1 text-xs font-medium text-gray-11">
                    OpenAPI Source Paths:
                  </p>
                  <ul className="space-y-0.5">
                    {endpoint.openapi_source_paths.map((p, i) => (
                      <li key={i} className="text-xs text-gray-12 font-mono">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-11 hover:bg-gray-4 hover:text-gray-12"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
