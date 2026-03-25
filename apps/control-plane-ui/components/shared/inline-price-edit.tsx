"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Pencil1Icon,
  CheckIcon,
  Cross2Icon,
  PlusIcon,
  MinusIcon,
} from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { MIN_PRICE_USD, MAX_PRICE_USD } from "@/lib/types/api";

interface InlinePriceEditProps {
  priceMicro: number;
  defaultPriceMicro?: number;
  onUpdate: () => void;
  apiEndpoint: string;
  fieldName?: string;
  label?: string;
}

export function InlinePriceEdit({
  priceMicro,
  defaultPriceMicro,
  onUpdate,
  apiEndpoint,
  fieldName = "default_price",
  label = "Default Price",
}: InlinePriceEditProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [price, setPrice] = useState((priceMicro / 1_000_000).toString());

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newPrice = Math.round((parseFloat(price) || 0) * 1_000_000);
      // If defaultPriceMicro is provided and value matches, send null to use default
      const valueToSend =
        defaultPriceMicro !== undefined && newPrice === defaultPriceMicro
          ? null
          : newPrice;
      await api.put(apiEndpoint, {
        [fieldName]: valueToSend,
      });
      toast({
        title: "Price updated",
        variant: "default",
      });
      onUpdate();
      setIsOpen(false);
    } catch (err) {
      toast({
        title: "Failed to update",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setPrice((priceMicro / 1_000_000).toString());
    }
    setIsOpen(open);
  };

  const displayPrice = `$${(priceMicro / 1_000_000).toFixed(3)}`;

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button className="group flex items-center gap-1 rounded bg-gray-4 px-2 py-1 text-xs text-gray-11 hover:bg-gray-5 cursor-pointer text-left">
          <span>{displayPrice} USD</span>
          <Pencil1Icon className="h-3 w-3 opacity-50 group-hover:opacity-100" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-64 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
          sideOffset={5}
          align="start"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-1">
                {label}
              </label>
              <div className="flex items-center gap-0 rounded-md border border-gray-6 bg-gray-3">
                <button
                  type="button"
                  onClick={() => {
                    const val = Math.max(0, parseFloat(price || "0") - 0.001);
                    setPrice(val.toFixed(3).replace(/\.?0+$/, "") || "0");
                  }}
                  className="flex h-8 w-8 items-center justify-center text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors rounded-l-md"
                >
                  <MinusIcon className="h-3 w-3" />
                </button>
                <div className="flex flex-1 items-center">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setPrice(val);
                      }
                    }}
                    className="w-full bg-transparent py-1.5 text-center text-sm text-gray-12 focus:outline-none"
                  />
                  <span className="pr-2 text-xs text-gray-11">USD</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const val = parseFloat(price || "0") + 0.001;
                    setPrice(val.toFixed(3).replace(/\.?0+$/, ""));
                  }}
                  className="flex h-8 w-8 items-center justify-center text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors rounded-r-md"
                >
                  <PlusIcon className="h-3 w-3" />
                </button>
              </div>
              {(() => {
                const priceVal = parseFloat(price);
                if (price === "" || isNaN(priceVal)) {
                  return null;
                }
                if (priceVal < 0) {
                  return (
                    <p className="mt-1 text-xs text-red-400">
                      Price cannot be negative
                    </p>
                  );
                }
                if (priceVal > MAX_PRICE_USD) {
                  return (
                    <p className="mt-1 text-xs text-red-400">
                      Max price is ${MAX_PRICE_USD}
                    </p>
                  );
                }
                if (priceVal > 0 && priceVal < MIN_PRICE_USD) {
                  return (
                    <p className="mt-1 text-xs text-red-400">
                      Min price is ${MIN_PRICE_USD} (use $0 for free)
                    </p>
                  );
                }
                if (priceVal === 0) {
                  return <p className="mt-1 text-xs text-green-400">Free</p>;
                }
                return (
                  <p className="mt-1 text-xs text-green-400">
                    ${priceVal.toFixed(6).replace(/\.?0+$/, "")} per request
                  </p>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-11 hover:bg-gray-4"
              >
                <Cross2Icon className="h-3 w-3" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  isSaving ||
                  price === "" ||
                  isNaN(parseFloat(price)) ||
                  parseFloat(price) < 0 ||
                  parseFloat(price) > MAX_PRICE_USD ||
                  (parseFloat(price) > 0 && parseFloat(price) < MIN_PRICE_USD)
                }
                className="inline-flex items-center gap-1 rounded bg-accent-9 px-2 py-1 text-xs text-white hover:bg-accent-10 disabled:opacity-50"
              >
                <CheckIcon className="h-3 w-3" />
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          <Popover.Arrow className="fill-gray-6" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
