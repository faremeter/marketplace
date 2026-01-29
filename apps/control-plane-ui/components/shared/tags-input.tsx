"use client";

import { useState, useRef, useCallback } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import { MAX_TAGS, MAX_TAG_LENGTH } from "@/lib/types/api";

const TAG_REGEX = /^[a-z0-9][a-z0-9_-]*$/;

interface TagsInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TagsInput({
  tags,
  onChange,
  disabled = false,
  placeholder = "Add tag...",
}: TagsInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizeTag = (tag: string): string => {
    return tag.toLowerCase().trim();
  };

  const validateTag = useCallback(
    (tag: string): string | null => {
      const normalized = normalizeTag(tag);

      if (!normalized) {
        return null;
      }

      if (normalized.length > MAX_TAG_LENGTH) {
        return `Tag must be ${MAX_TAG_LENGTH} characters or less`;
      }

      if (!TAG_REGEX.test(normalized)) {
        return "Lowercase letters, numbers, hyphens, underscores only";
      }

      if (tags.includes(normalized)) {
        return "Tag already exists";
      }

      if (tags.length >= MAX_TAGS) {
        return `Maximum ${MAX_TAGS} tags allowed`;
      }

      return null;
    },
    [tags],
  );

  const addTag = useCallback(
    (tag: string) => {
      const normalized = normalizeTag(tag);
      const validationError = validateTag(normalized);

      if (validationError) {
        setError(validationError);
        return false;
      }

      onChange([...tags, normalized]);
      setInputValue("");
      setError(null);
      return true;
    },
    [tags, onChange, validateTag],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onChange(tags.filter((tag) => tag !== tagToRemove));
    },
    [tags, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === "Escape") {
      setInputValue("");
      setError(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (error && value !== inputValue) {
      setError(null);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      const added = addTag(inputValue);
      if (!added) {
        setTimeout(() => setError(null), 2000);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-md border bg-gray-2 px-2 py-1.5 ${
          disabled
            ? "border-gray-5 cursor-not-allowed opacity-60"
            : error
              ? "border-red-600"
              : "border-gray-6 focus-within:border-accent-8"
        }`}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-gray-4 px-2 py-0.5 text-xs text-gray-12"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="rounded-full p-0.5 hover:bg-gray-6 text-gray-11 hover:text-gray-12"
              >
                <Cross2Icon className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {tags.length < MAX_TAGS && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={tags.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[80px] bg-transparent text-sm text-gray-12 placeholder:text-gray-9 focus:outline-none disabled:cursor-not-allowed"
          />
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-gray-11">
        {tags.length}/{MAX_TAGS} tags. Press Enter to add.
      </p>
    </div>
  );
}
