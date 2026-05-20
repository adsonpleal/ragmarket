import { invoke } from "@tauri-apps/api/core";
import type { ClientInfo } from "./types";
import type { Server } from "./links";

export function discoverClients(): Promise<ClientInfo[]> {
  return invoke("discover_clients_cmd");
}

export function setClientSelection(pid: number | null): Promise<void> {
  return invoke("set_client_selection", { pid });
}

export type MarketExtremes = { min: number | null; max: number | null };

export function fetchMarketExtremes(
  itemId: number,
  itemName: string,
  server: Server,
): Promise<MarketExtremes> {
  return invoke("fetch_market_extremes", { itemId, itemName, server });
}

export type SaveFilter = { name: string; extensions: string[] };

// Opens a native "save as…" dialog and writes `contents` to the chosen
// path. Resolves with the saved path on success, or `null` if the user
// cancelled.
export function saveTextFile(
  defaultName: string,
  contents: string,
  filters: SaveFilter[],
): Promise<string | null> {
  return invoke("save_text_file", { defaultName, contents, filters });
}
