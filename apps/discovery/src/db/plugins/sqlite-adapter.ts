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
  BinaryOperationNode,
  OperatorNode,
  RawNode,
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

function wrapInLower(node: unknown): RawNode {
  return {
    kind: "RawNode",
    sqlFragments: ["lower(", ")"],
    parameters: [node],
  } as RawNode;
}

function transformValueToLower(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as { kind?: string; value?: unknown };
  if (n.kind === "ValueNode" && typeof n.value === "string") {
    return { kind: "ValueNode", value: n.value.toLowerCase() };
  }
  return node;
}

function wrapWithEscape(node: unknown): RawNode {
  return {
    kind: "RawNode",
    sqlFragments: ["", " ESCAPE '\\'"],
    parameters: [node],
  } as RawNode;
}

function stripPostgresCast(sql: string): string {
  return sql.replace(/::text/g, "");
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

  override transformBinaryOperation(
    node: BinaryOperationNode,
  ): BinaryOperationNode {
    const op = node.operator as OperatorNode;
    if (op.operator === "ilike") {
      const leftTransformed = this.transformNode(node.leftOperand);
      const rightTransformed = this.transformNode(node.rightOperand);
      return {
        kind: "BinaryOperationNode",
        leftOperand: wrapInLower(leftTransformed),
        operator: { kind: "OperatorNode", operator: "like" } as OperatorNode,
        rightOperand: wrapWithEscape(transformValueToLower(rightTransformed)),
      } as BinaryOperationNode;
    }
    return super.transformBinaryOperation(node);
  }

  override transformRaw(node: RawNode): RawNode {
    const transformed = node.sqlFragments.map(stripPostgresCast);
    if (transformed.some((s, i) => s !== node.sqlFragments[i])) {
      return { ...node, sqlFragments: transformed };
    }
    return node;
  }
}

const transformer = new SqliteTransformer();

export class SqliteAdapterPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return transformer.transformNode(args.node);
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
