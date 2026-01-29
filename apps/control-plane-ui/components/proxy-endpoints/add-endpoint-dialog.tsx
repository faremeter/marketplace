"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon, PlusIcon, MinusIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { SCHEME_OPTIONS } from "@/lib/types/api";
import { TagsInput } from "@/components/shared/tags-input";
import { useAuth } from "@/lib/auth/context";
import { refreshOnboardingStatus } from "@/lib/hooks/use-onboarding";

interface AddEndpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  hasOpenApiSpec: boolean;
  onSuccess: () => void;
  defaultPriceUsdc: number;
  defaultScheme: string;
}

interface ValidatePatternResponse {
  valid: boolean;
  isValidRegex: boolean;
  matches: string[];
  hasSpec?: boolean;
  error?: string;
}

export function AddEndpointDialog({
  open,
  onOpenChange,
  tenantId,
  hasOpenApiSpec,
  onSuccess,
  defaultPriceUsdc,
  defaultScheme,
}: AddEndpointDialogProps) {
  const [pathPattern, setPathPattern] = useState("");
  const [priceUsdc, setPriceUsdc] = useState("");
  const [scheme, setScheme] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidatePatternResponse | null>(
    null,
  );
  const [tags, setTags] = useState<string[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const { toast } = useToast();
  const { currentOrg } = useAuth();

  useEffect(() => {
    setSelectedPaths([]);

    if (!pathPattern.trim()) {
      setValidation(null);
      return;
    }

    const timer = setTimeout(async () => {
      const catchAllPatterns = ["/", "/*", "^/$", "^/.*$"];
      if (catchAllPatterns.includes(pathPattern)) {
        setValidation({
          valid: false,
          isValidRegex: false,
          matches: [],
          error: "Edit the catch-all row in the table to set pricing for /",
        });
        return;
      }

      // Only validate as regex if it starts with ^
      // Otherwise it's either OpenAPI-style ({param}) or literal prefix
      if (pathPattern.startsWith("^")) {
        try {
          new RegExp(pathPattern);
          setValidation({
            valid: true,
            isValidRegex: true,
            matches: [],
            hasSpec: false,
          });
        } catch {
          setValidation({
            valid: false,
            isValidRegex: false,
            matches: [],
            error: "Invalid regex pattern",
          });
        }
      } else {
        // Non-regex patterns are always valid
        setValidation({
          valid: true,
          isValidRegex: true,
          matches: [],
          hasSpec: false,
        });
      }

      // If we have an OpenAPI spec, also check for matches
      if (hasOpenApiSpec) {
        setValidating(true);
        try {
          const result = await api.post<ValidatePatternResponse>(
            `/api/tenants/${tenantId}/openapi/validate-pattern`,
            { pattern: pathPattern },
          );
          setSelectedPaths(result.matches);
          setValidation((prev) =>
            prev ? { ...prev, matches: result.matches } : null,
          );
        } catch {
          // Ignore validation errors for OpenAPI matching
        } finally {
          setValidating(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [pathPattern, tenantId, hasOpenApiSpec]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pathPattern.trim()) return;
    if (!validation?.isValidRegex) return;

    setSaving(true);
    try {
      await api.post(`/api/tenants/${tenantId}/endpoints`, {
        path: pathPattern.trim(),
        price_usdc: priceUsdc
          ? Math.round(parseFloat(priceUsdc) * 1000000)
          : null,
        scheme: scheme || null,
        description: description.trim() || null,
        openapi_source_paths: selectedPaths.length > 0 ? selectedPaths : null,
        tags: tags.length > 0 ? tags : [],
      });

      toast({
        title: "Endpoint created",
        variant: "default",
      });

      if (currentOrg) {
        refreshOnboardingStatus(currentOrg.id);
      }

      setPathPattern("");
      setPriceUsdc("");
      setScheme("");
      setDescription("");
      setTags([]);
      setValidation(null);
      setSelectedPaths([]);
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({
        title: "Failed to create endpoint",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePath = (path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Add Endpoint
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-11">
                Path <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={pathPattern}
                onChange={(e) => setPathPattern(e.target.value)}
                placeholder="/api/users/{id}"
                className="mt-1 w-full rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm text-gray-12 font-mono placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                required
              />
              <p className="mt-1 text-xs text-gray-9">
                example: /api/users or /api/users/{"{id}"}
              </p>
              {validating && (
                <p className="mt-1 text-xs text-gray-11">Validating...</p>
              )}
              {validation?.error && (
                <p className="mt-1 text-xs text-red-400">{validation.error}</p>
              )}
            </div>

            {validation?.isValidRegex && hasOpenApiSpec && (
              <div>
                {validation.matches.length > 0 ? (
                  <div className="rounded-md border border-gray-6 bg-gray-3 p-3">
                    <p className="mb-2 text-xs font-medium text-gray-11">
                      Matches from OpenAPI spec:
                    </p>
                    <div className="max-h-32 space-y-1 overflow-y-auto">
                      {validation.matches.map((path) => (
                        <label
                          key={path}
                          className="flex items-center gap-2 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPaths.includes(path)}
                            onChange={() => togglePath(path)}
                            className="rounded border-gray-6"
                          />
                          <code className="text-gray-12">{path}</code>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

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
                        parseFloat(priceUsdc || "0") - 0.01,
                      );
                      setPriceUsdc(val.toFixed(3));
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
                      placeholder={(defaultPriceUsdc / 1_000_000).toFixed(3)}
                      className="w-full bg-transparent py-2 text-center text-sm text-gray-12 placeholder-gray-9 focus:outline-none"
                    />
                    <span className="pr-2 text-xs text-gray-11">USDC</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseFloat(priceUsdc || "0") + 0.01;
                      setPriceUsdc(val.toFixed(3));
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
                  value={scheme || defaultScheme}
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

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-11 hover:bg-gray-4 hover:text-gray-12"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !validation?.isValidRegex}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Add Endpoint"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
