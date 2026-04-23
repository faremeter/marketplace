import { validate } from "@scalar/openapi-parser";

interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParseResult {
  valid: boolean;
  spec: OpenApiDocument | null;
  paths: string[];
  info: { title?: string; version?: string };
  errors: string[];
}

export async function parseOpenApiSpec(input: string): Promise<ParseResult> {
  const empty: ParseResult = {
    valid: false,
    spec: null,
    paths: [],
    info: {},
    errors: [],
  };

  if (!input.trim()) {
    return { ...empty, errors: ["Empty input"] };
  }

  let valid: boolean;
  let errors: { message: string }[] | undefined;
  let specification: OpenApiDocument | undefined;

  try {
    const result = await validate(input);
    valid = result.valid;
    errors = result.errors;
    specification = result.specification as OpenApiDocument | undefined;
  } catch (e) {
    return {
      ...empty,
      errors: [e instanceof Error ? e.message : "Failed to parse spec"],
    };
  }

  if (!valid || !specification) {
    return {
      ...empty,
      errors: errors?.map((e) => e.message) ?? ["Invalid OpenAPI spec"],
    };
  }

  const paths = specification.paths
    ? Object.keys(specification.paths).filter((p) => p !== "/" && p !== "/*")
    : [];

  return {
    valid: true,
    spec: specification,
    paths,
    info: {
      title: specification.info?.title,
      version: specification.info?.version,
    },
    errors: [],
  };
}
