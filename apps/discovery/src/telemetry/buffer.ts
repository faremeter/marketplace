import { sql } from "kysely";
import { db, isTest } from "../db/instance.js";
import { logger } from "../logger.js";

const FLUSH_INTERVAL_MS = 60_000;
const DEDUP_TTL_MS = 5 * 60 * 1000;
const BUCKET_MS = 15 * 60 * 1000;

export interface TelemetryEvent {
  event_type: "search" | "view";
  event_key?: string;
  proxy_id?: number;
  endpoint_id?: number;
}

export interface PendingEvent extends TelemetryEvent {
  bucket: Date;
  count: number;
}

function bufferKey(event: TelemetryEvent, bucket: Date): string {
  if (event.event_type === "search") {
    return `search:${event.event_key}:${bucket.getTime()}`;
  }
  return `view:${event.proxy_id}:${event.endpoint_id ?? 0}:${bucket.getTime()}`;
}

function dedupKey(event: TelemetryEvent, ip: string): string {
  if (event.event_type === "search") {
    return `search:${event.event_key}:${ip}`;
  }
  return `view:${event.proxy_id}:${event.endpoint_id ?? 0}:${ip}`;
}

export function toBucket(now: Date = new Date()): Date {
  const ms = Math.floor(now.getTime() / BUCKET_MS) * BUCKET_MS;
  return new Date(ms);
}

const buffer = new Map<string, PendingEvent>();
const dedupMap = new Map<string, number>();
let flushTimer: ReturnType<typeof setInterval> | null = null;

function cleanDedup(): void {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [key, ts] of dedupMap) {
    if (ts < cutoff) {
      dedupMap.delete(key);
    }
  }
}

export function record(event: TelemetryEvent, ip: string): void {
  const dk = dedupKey(event, ip);
  const now = Date.now();

  const lastSeen = dedupMap.get(dk);
  if (lastSeen && now - lastSeen < DEDUP_TTL_MS) {
    return;
  }
  dedupMap.set(dk, now);

  const bucket = toBucket();
  const bk = bufferKey(event, bucket);

  const existing = buffer.get(bk);
  if (existing) {
    existing.count++;
  } else {
    buffer.set(bk, { ...event, bucket, count: 1 });
  }
}

export async function flush(): Promise<void> {
  if (buffer.size === 0) return;

  const flushing = new Map(buffer);
  buffer.clear();

  if (isTest) {
    cleanDedup();
    return;
  }

  const events = [...flushing.values()];

  try {
    await db.transaction().execute(async (trx) => {
      for (const event of events) {
        if (event.event_type === "search") {
          await sql`
            INSERT INTO discovery_telemetry (event_type, event_key, bucket, count)
            VALUES (${event.event_type}, ${event.event_key ?? null}, ${event.bucket.toISOString()}, ${event.count})
            ON CONFLICT (event_type, event_key, bucket)
            WHERE event_type = 'search'
            DO UPDATE SET count = discovery_telemetry.count + ${event.count}, updated_at = now()
          `.execute(trx);
        } else {
          await sql`
            INSERT INTO discovery_telemetry (event_type, proxy_id, endpoint_id, bucket, count)
            VALUES (${event.event_type}, ${event.proxy_id ?? null}, ${event.endpoint_id ?? null}, ${event.bucket.toISOString()}, ${event.count})
            ON CONFLICT (event_type, proxy_id, COALESCE(endpoint_id, 0), bucket)
            WHERE event_type = 'view'
            DO UPDATE SET count = discovery_telemetry.count + ${event.count}, updated_at = now()
          `.execute(trx);
        }
      }
    });
  } catch (error) {
    for (const [key, event] of flushing) {
      const existing = buffer.get(key);
      if (existing) {
        existing.count += event.count;
      } else {
        buffer.set(key, event);
      }
    }
    logger.error("Telemetry flush error", { error });
  } finally {
    cleanDedup();
  }
}

export function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
}

export function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function _testInspect(): {
  bufferSize: number;
  dedupSize: number;
  events: PendingEvent[];
} {
  return {
    bufferSize: buffer.size,
    dedupSize: dedupMap.size,
    events: [...buffer.values()],
  };
}

export function _testReset(): void {
  if (!isTest) return;
  buffer.clear();
  dedupMap.clear();
}
