"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Pencil1Icon, CheckIcon } from "@radix-ui/react-icons";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface TenantNode {
  id: number;
  name: string;
  cert_status: string | null;
  is_primary: boolean;
}

interface Node {
  id: number;
  name: string;
  status: string;
}

interface InlineNodeSelectProps {
  tenantId: number;
  tenantName: string;
  nodes: TenantNode[];
  onUpdate: () => void;
}

function CertStatusIndicator({ status }: { status: string | null }) {
  if (status === "pending") {
    return (
      <span
        className="relative ml-1 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500"
        style={{ animation: "certPulse 2s ease-in-out infinite" }}
      >
        <style>{`
          @keyframes certPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </span>
    );
  }
  if (status === "deleting") {
    return (
      <span
        className="relative ml-1 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-500"
        style={{ animation: "certPulse 2s ease-in-out infinite" }}
      >
        <style>{`
          @keyframes certPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </span>
    );
  }
  if (status === "provisioned") {
    return (
      <span className="ml-1 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
    );
  }
  if (status === "failed") {
    return (
      <span className="ml-1 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
    );
  }
  return null;
}

export function InlineNodeSelect({
  tenantId,
  tenantName,
  nodes,
  onUpdate,
}: InlineNodeSelectProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nodeToRemove, setNodeToRemove] = useState<TenantNode | null>(null);

  const { data: allNodes } = useSWR(
    isOpen ? "/api/admin/nodes" : null,
    api.get<Node[]>,
  );

  const currentNodeIds = new Set(nodes.map((n) => n.id));
  const activeNodes = allNodes?.filter((n) => n.status === "active") ?? [];

  const handleAddNode = async (nodeId: number) => {
    setIsSaving(true);
    try {
      await api.post(`/api/admin/tenants/${tenantId}/nodes`, {
        node_id: nodeId,
      });
      toast({
        title: "Node added",
        description: `Node has been added to ${tenantName}.`,
        variant: "success",
      });
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to add node",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveNode = async (node: TenantNode) => {
    setIsSaving(true);
    try {
      await api.delete(`/api/admin/tenants/${tenantId}/nodes/${node.id}`);
      toast({
        title: "Node removed",
        description: `${node.name} has been removed from ${tenantName}.`,
        variant: "success",
      });
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to remove node",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
      setNodeToRemove(null);
    }
  };

  const handleCheckboxChange = (node: Node, checked: boolean) => {
    if (checked) {
      void handleAddNode(node.id);
    } else {
      const tenantNode = nodes.find((n) => n.id === node.id);
      if (tenantNode) {
        setNodeToRemove(tenantNode);
      }
    }
  };

  return (
    <>
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <button className="group flex flex-wrap items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-4 cursor-pointer text-left min-h-[28px]">
            {nodes.length > 0 ? (
              nodes.map((node) => (
                <span
                  key={node.id}
                  className="inline-flex items-center rounded bg-gray-4 px-1.5 py-0.5 text-xs text-gray-11"
                >
                  {node.name}
                  <CertStatusIndicator status={node.cert_status} />
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-11">-</span>
            )}
            <Pencil1Icon className="h-3 w-3 text-gray-8 opacity-0 group-hover:opacity-100" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="w-80 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
            sideOffset={5}
            align="start"
          >
            <div className="space-y-3">
              <div className="text-xs font-medium text-gray-11">
                Select nodes for {tenantName}
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {activeNodes.map((node) => {
                  const isChecked = currentNodeIds.has(node.id);
                  const tenantNode = nodes.find((n) => n.id === node.id);
                  const isPending = tenantNode?.cert_status === "pending";
                  const isDeleting = tenantNode?.cert_status === "deleting";
                  const isDisabled = isPending || isDeleting;

                  return (
                    <Tooltip.Provider key={node.id} delayDuration={200}>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <label
                            className={`flex items-center gap-2 rounded p-2 transition-colors ${
                              isDisabled
                                ? "cursor-not-allowed opacity-60"
                                : "cursor-pointer hover:bg-gray-3"
                            }`}
                          >
                            <Checkbox.Root
                              checked={isChecked}
                              disabled={isSaving || isDisabled}
                              onCheckedChange={(checked) =>
                                handleCheckboxChange(node, checked === true)
                              }
                              className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                                isChecked
                                  ? "border-gray-12 bg-gray-12"
                                  : "border-gray-6 bg-gray-3 hover:border-gray-8"
                              } ${isDisabled ? "cursor-not-allowed" : ""}`}
                            >
                              <Checkbox.Indicator>
                                <CheckIcon className="h-3 w-3 text-gray-1" />
                              </Checkbox.Indicator>
                            </Checkbox.Root>
                            <span className="flex-1 text-sm text-gray-12">
                              {node.name}
                            </span>
                            {tenantNode && (
                              <CertStatusIndicator
                                status={tenantNode.cert_status}
                              />
                            )}
                          </label>
                        </Tooltip.Trigger>
                        {isDisabled && (
                          <Tooltip.Portal>
                            <Tooltip.Content
                              className="rounded bg-gray-12 px-2 py-1 text-xs text-gray-1"
                              sideOffset={5}
                            >
                              {isDeleting
                                ? "Node is being removed"
                                : "Cannot remove while cert provisioning is in progress"}
                              <Tooltip.Arrow className="fill-gray-12" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        )}
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  );
                })}
                {activeNodes.length === 0 && (
                  <p className="py-2 text-center text-xs text-gray-11">
                    No active nodes available
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-6 pt-2 text-xs text-gray-11">
                <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-yellow-500" />
                <span>Pending</span>
                <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                <span>Provisioned</span>
                <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-500 animate-pulse" />
                <span>Deleting</span>
                <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                <span>Failed</span>
              </div>
            </div>
            <Popover.Arrow className="fill-gray-6" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <AlertDialog.Root
        open={nodeToRemove !== null}
        onOpenChange={(open) => !open && setNodeToRemove(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
            <AlertDialog.Title className="text-lg font-semibold text-gray-12">
              Remove node
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-gray-11">
              Are you sure you want to remove{" "}
              <span className="font-medium text-gray-12">
                {nodeToRemove?.name}
              </span>{" "}
              from {tenantName}? This will remove the tenant configuration from
              that node.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={() => {
                    if (nodeToRemove) void handleRemoveNode(nodeToRemove);
                  }}
                  disabled={isSaving}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isSaving ? "Removing..." : "Remove"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
