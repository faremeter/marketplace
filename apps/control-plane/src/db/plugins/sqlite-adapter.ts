import { OperationNodeTransformer } from "kysely";
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  RootOperationNode,
  QueryResult,
  UnknownRow,
  ValueNode,
  PrimitiveValueListNode,
} from "kysely";

const BOOLEAN_COLUMNS = new Set([
  "is_admin",
  "is_active",
  "is_primary",
  "email_verified",
  "onboarding_completed",
]);

const ARRAY_COLUMNS = new Set(["openapi_source_paths", "tags"]);

const JSON_COLUMNS = new Set(["openapi_spec", "wallet_config", "email_config"]);

function transformPrimitive(value: unknown): unknown {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

class SqliteTransformer extends OperationNodeTransformer {
  override transformValue(node: ValueNode): ValueNode {
    const transformed = transformPrimitive(node.value);
    if (transformed !== node.value) {
      return { kind: "ValueNode", value: transformed };
    }
    return node;
  }

  override transformPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): PrimitiveValueListNode {
    const transformed = node.values.map(transformPrimitive);
    const changed = transformed.some((v, i) => v !== node.values[i]);
    if (changed) {
      return { kind: "PrimitiveValueListNode", values: transformed };
    }
    return node;
  }
}

const transformer = new SqliteTransformer();

export class SqliteAdapterPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return transformer.transformNode(args.node) as RootOperationNode;
  }

  async transformResult(
    args: PluginTransformResultArgs,
  ): Promise<QueryResult<UnknownRow>> {
    return {
      ...args.result,
      rows: args.result.rows.map((row) => {
        const transformed: UnknownRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (BOOLEAN_COLUMNS.has(key) && (value === 0 || value === 1)) {
            transformed[key] = value === 1;
          } else if (ARRAY_COLUMNS.has(key) && typeof value === "string") {
            try {
              transformed[key] = JSON.parse(value);
            } catch {
              transformed[key] = value;
            }
          } else if (JSON_COLUMNS.has(key) && typeof value === "string") {
            try {
              transformed[key] = JSON.parse(value);
            } catch {
              transformed[key] = value;
            }
          } else {
            transformed[key] = value;
          }
        }
        return transformed;
      }),
    };
  }
}
