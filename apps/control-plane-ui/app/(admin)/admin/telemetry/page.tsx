"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";

type TimeRange = "24h" | "7d" | "30d" | "all";

const BRAND_ORANGE = "var(--brand-orange)";
const BRAND_ORANGE_50 =
  "color-mix(in srgb, var(--brand-orange) 50%, transparent)";

interface TopSearch {
  event_key: string;
  total: number;
}

interface TopProxy {
  proxy_id: number;
  proxy_name: string;
  endpoint_id: number | null;
  path_pattern: string | null;
  total: number;
}

interface TimeseriesPoint {
  event_type: string;
  bucket: string;
  total: number;
}

function getFromDate(range: TimeRange): string | undefined {
  if (range === "all") return undefined;
  const now = new Date();
  const ms = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 }[range];
  return new Date(now.getTime() - ms).toISOString();
}

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  const options: TimeRange[] = ["24h", "7d", "30d", "all"];
  return (
    <div className="flex gap-1 rounded-md border border-gray-6 bg-gray-3 p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            value === opt ? "text-white" : "text-gray-11 hover:text-gray-12"
          }`}
          style={value === opt ? { backgroundColor: BRAND_ORANGE } : undefined}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function TelemetryPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const from = useMemo(() => getFromDate(range), [range]);

  const searchParams = from ? `?from=${from}` : "";

  const { data: topSearches, isLoading: searchesLoading } = useSWR(
    `/api/admin/telemetry/top-searches${searchParams}`,
    api.get<TopSearch[]>,
  );

  const { data: topProxies, isLoading: proxiesLoading } = useSWR(
    `/api/admin/telemetry/top-proxies${searchParams}`,
    api.get<TopProxy[]>,
  );

  const { data: timeseries, isLoading: tsLoading } = useSWR(
    `/api/admin/telemetry/timeseries${searchParams}`,
    api.get<TimeseriesPoint[]>,
  );

  const isLoading = searchesLoading || proxiesLoading || tsLoading;

  const timeseriesSummary = useMemo(() => {
    if (!timeseries) return { searches: 0, views: 0 };
    return timeseries.reduce(
      (acc, p) => {
        if (p.event_type === "search") acc.searches += p.total;
        else acc.views += p.total;
        return acc;
      },
      { searches: 0, views: 0 },
    );
  }, [timeseries]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">
            Discovery Telemetry
          </h1>
          <p className="text-sm text-gray-11">
            Search queries and proxy views from the discovery API
          </p>
        </div>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
          <p className="text-xs font-medium text-gray-11">Total Searches</p>
          <p className="mt-1 text-2xl font-semibold text-gray-12">
            {isLoading ? "..." : timeseriesSummary.searches.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
          <p className="text-xs font-medium text-gray-11">Total Views</p>
          <p className="mt-1 text-2xl font-semibold text-gray-12">
            {isLoading ? "..." : timeseriesSummary.views.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-gray-6 bg-gray-2">
          <div className="border-b border-gray-6 px-4 py-3">
            <h2 className="text-sm font-medium text-gray-12">Top Searches</h2>
          </div>
          <div className="p-4">
            {searchesLoading ? (
              <Spinner />
            ) : !topSearches?.length ? (
              <p className="text-sm text-gray-11">No search data yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-11">
                    <th className="pb-2">Query</th>
                    <th className="pb-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topSearches.map((s) => (
                    <tr
                      key={s.event_key}
                      className="border-t border-gray-6 text-sm"
                    >
                      <td className="py-2 text-gray-12">
                        <code className="rounded bg-gray-4 px-1.5 py-0.5 text-xs">
                          {s.event_key}
                        </code>
                      </td>
                      <td className="py-2 text-right text-gray-12">
                        {s.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-6 bg-gray-2">
          <div className="border-b border-gray-6 px-4 py-3">
            <h2 className="text-sm font-medium text-gray-12">
              Top Proxies / Endpoints
            </h2>
          </div>
          <div className="p-4">
            {proxiesLoading ? (
              <Spinner />
            ) : !topProxies?.length ? (
              <p className="text-sm text-gray-11">No view data yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-11">
                    <th className="pb-2">Proxy</th>
                    <th className="pb-2">Endpoint</th>
                    <th className="pb-2 text-right">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {topProxies.map((p) => (
                    <tr
                      key={`${p.proxy_id}-${p.endpoint_id}`}
                      className="border-t border-gray-6 text-sm"
                    >
                      <td className="py-2 text-gray-12">{p.proxy_name}</td>
                      <td className="py-2 text-gray-11">
                        {p.path_pattern ? (
                          <code className="rounded bg-gray-4 px-1.5 py-0.5 text-xs">
                            {p.path_pattern}
                          </code>
                        ) : (
                          <span className="text-xs italic text-gray-9">
                            all endpoints
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right text-gray-12">
                        {p.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-6 bg-gray-2">
        <div className="flex items-center justify-between border-b border-gray-6 px-4 py-3">
          <h2 className="text-sm font-medium text-gray-12">
            Activity Over Time
          </h2>
          <span className="text-xs text-gray-11">
            {range === "24h"
              ? "Last 24 hours"
              : range === "7d"
                ? "Last 7 days"
                : range === "30d"
                  ? "Last 30 days"
                  : "All time"}
          </span>
        </div>
        <div className="p-4">
          {tsLoading ? (
            <Spinner />
          ) : !timeseries?.length ? (
            <p className="text-sm text-gray-11">No data yet.</p>
          ) : (
            <ActivityChart data={timeseries} range={range} />
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
    </div>
  );
}

function ActivityChart({
  data,
  range,
}: {
  data: TimeseriesPoint[];
  range: TimeRange;
}) {
  const grouped = useMemo(() => {
    const dataMap = new Map<string, { searches: number; views: number }>();
    for (const p of data) {
      const day = p.bucket.slice(0, 10);
      const entry = dataMap.get(day) || { searches: 0, views: 0 };
      if (p.event_type === "search") entry.searches += p.total;
      else entry.views += p.total;
      dataMap.set(day, entry);
    }

    let days = range === "24h" ? 1 : range === "7d" ? 7 : 30;
    if (range === "all" && dataMap.size > 0) {
      const earliest = [...dataMap.keys()].sort()[0];
      const span = Math.ceil(
        (Date.now() - new Date(earliest).getTime()) / 86400000,
      );
      days = Math.max(span + 1, 30);
    }
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const period = date.toISOString().slice(0, 10);
      const entry = dataMap.get(period) || { searches: 0, views: 0 };
      result.push({ date: period, label: period.slice(5), ...entry });
    }
    return result;
  }, [data, range]);

  const maxVal = Math.max(...grouped.map((g) => g.searches + g.views), 1);

  return (
    <div className="space-y-1">
      <div className="mb-3 flex items-center gap-4 text-xs text-gray-11">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: BRAND_ORANGE }}
          />
          Searches
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: BRAND_ORANGE_50 }}
          />
          Views
        </span>
      </div>
      <div className="flex" style={{ height: 120 }}>
        <div className="flex flex-col justify-between pr-2 text-[10px] text-gray-9">
          <span>{maxVal}</span>
          <span>{Math.round(maxVal / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex flex-1 items-end gap-px">
          {grouped.map((g) => {
            const searchH = (g.searches / maxVal) * 100;
            const viewH = (g.views / maxVal) * 100;
            return (
              <div
                key={g.date}
                className="group relative flex flex-1 flex-col items-stretch justify-end"
                style={{ height: "100%" }}
                title={`${g.date}\nSearches: ${g.searches}\nViews: ${g.views}`}
              >
                <div
                  style={{
                    backgroundColor: "rgba(234, 134, 42, 0.5)",
                    height: `${viewH}%`,
                    minHeight: g.views ? 2 : 0,
                  }}
                  className="transition-opacity group-hover:opacity-80"
                />
                <div
                  style={{
                    backgroundColor: "#ea862a",
                    height: `${searchH}%`,
                    minHeight: g.searches ? 2 : 0,
                  }}
                  className="transition-opacity group-hover:opacity-80"
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex text-[10px] text-gray-9" style={{ paddingLeft: 24 }}>
        {grouped.map((g, i) => {
          const step = grouped.length > 14 ? 5 : 1;
          const show = i % step === 0 || i === grouped.length - 1;
          return (
            <span key={g.date} className="flex-1 text-center">
              {show ? g.label : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
