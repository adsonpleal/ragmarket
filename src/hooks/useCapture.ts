import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { extract0836Packets, ShopRecord } from "../services/parser";

export type NetworkInterface = {
  index: number;
  name: string;
  ipv4: string;
  is_loopback: boolean;
};

export type CaptureStatus = "idle" | "recording" | "stopped";

export type PacketEvent = {
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  payload_hex: string;
};

export type CaptureStats = {
  packets_seen: number;
  matched: number;
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function streamKey(p: PacketEvent): string {
  return `${p.src_ip}:${p.src_port}->${p.dst_ip}:${p.dst_port}`;
}

const FLUSH_INTERVAL_MS = 100;

export function useCapture() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [stats, setStats] = useState<CaptureStats>({ packets_seen: 0, matched: 0 });
  const [records, setRecords] = useState<ShopRecord[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Per-stream byte buffers (reassembled in order of arrival).
  const streams = useRef<Map<string, Uint8Array>>(new Map());
  // Pending batched updates — flushed every FLUSH_INTERVAL_MS to keep React
  // re-renders bounded under heavy packet load.
  const pendingRecords = useRef<ShopRecord[]>([]);
  const pendingPages = useRef(0);
  const flushTimer = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    flushTimer.current = null;
    const batch = pendingRecords.current;
    const pages = pendingPages.current;
    if (batch.length === 0 && pages === 0) return;
    pendingRecords.current = [];
    pendingPages.current = 0;
    if (batch.length > 0) {
      setRecords((rs) => rs.concat(batch));
    }
    if (pages > 0) {
      setPageCount((c) => c + pages);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current != null) return;
    flushTimer.current = window.setTimeout(flushPending, FLUSH_INTERVAL_MS);
  }, [flushPending]);

  const refreshInterfaces = useCallback(async () => {
    try {
      const ifs = (await invoke("list_interfaces")) as NetworkInterface[];
      setInterfaces(ifs);
      const def = ifs.find((i) => !i.is_loopback);
      if (def) setSelectedIp(def.ipv4);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshInterfaces();
  }, [refreshInterfaces]);

  // Listen for backend events whenever we're recording.
  useEffect(() => {
    if (status !== "recording") return;
    const aborted = { current: false };
    const unsubscribers: UnlistenFn[] = [];

    // Helper: subscribe, and if the effect already aborted between awaits,
    // immediately unsubscribe and stop registering more.
    async function subscribe<T>(
      event: string,
      handler: (e: { payload: T }) => void,
    ): Promise<boolean> {
      const u = await listen<T>(event, handler as never);
      if (aborted.current) {
        u();
        return false;
      }
      unsubscribers.push(u);
      return true;
    }

    (async () => {
      if (
        !(await subscribe<PacketEvent>("packet-bytes", (e) => {
          const key = streamKey(e.payload);
          const prev = streams.current.get(key) ?? new Uint8Array();
          const merged = concat(prev, hexToBytes(e.payload.payload_hex));
          const { pages, tail } = extract0836Packets(merged);
          streams.current.set(key, tail);
          if (pages.length > 0) {
            for (const p of pages) {
              for (const r of p.records) pendingRecords.current.push(r);
            }
            pendingPages.current += pages.length;
            scheduleFlush();
          }
        }))
      )
        return;
      if (
        !(await subscribe<CaptureStats>("capture-stats", (e) =>
          setStats(e.payload),
        ))
      )
        return;
      if (
        !(await subscribe<string>("capture-error", (e) => {
          console.error("[useCapture] capture-error:", e.payload);
          setError(String(e.payload));
        }))
      )
        return;
      await subscribe("capture-stopped", () =>
        setStatus((s) => (s === "recording" ? "stopped" : s)),
      );
    })();

    return () => {
      aborted.current = true;
      unsubscribers.forEach((u) => u());
      // Flush any pending records so the user sees them on stop.
      if (flushTimer.current != null) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      flushPending();
    };
  }, [status, scheduleFlush, flushPending]);

  const start = useCallback(async () => {
    if (!selectedIp) {
      setError("No interface selected");
      return;
    }
    setRecords([]);
    setPageCount(0);
    setStats({ packets_seen: 0, matched: 0 });
    streams.current.clear();
    pendingRecords.current = [];
    pendingPages.current = 0;
    setError(null);
    try {
      await invoke("start_capture", { ipv4: selectedIp });
      setStatus("recording");
    } catch (e) {
      setError(String(e));
    }
  }, [selectedIp]);

  const stop = useCallback(async () => {
    try {
      await invoke("stop_capture");
    } catch (e) {
      setError(String(e));
    }
    setStatus("stopped");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setRecords([]);
    setPageCount(0);
    streams.current.clear();
    pendingRecords.current = [];
    pendingPages.current = 0;
    setError(null);
  }, []);

  /** Wipe captured records without changing recording state. */
  const clearRecords = useCallback(() => {
    setRecords([]);
    setPageCount(0);
    streams.current.clear();
    pendingRecords.current = [];
    pendingPages.current = 0;
  }, []);

  return {
    interfaces,
    selectedIp,
    setSelectedIp,
    status,
    stats,
    records,
    pageCount,
    error,
    start,
    stop,
    reset,
    clearRecords,
    refreshInterfaces,
  };
}
