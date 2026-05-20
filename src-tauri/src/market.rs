// Scrapes the gnjoylatam vending-store search page for the min and max
// price of a specific item.
//
// The page is a Next.js app. The HTML payload doesn't contain real `<table>`
// rows — it contains the React Server Components streaming payload, where
// the search results JSON has been re-escaped into a string passed to
// `__next_f.push([1, "..."])`. Inside that string each result row looks
// like:
//
//   {\"svrId\":3,\"itemId\":4423,\"mapId\":835,\"ssi\":\"...\",
//    \"itemName\":\"Carta Galion\",...,\"itemPrice\":10000,\"itemCnt\":1,...}
//
// We don't try to unescape and parse JSON — that's brittle across stream
// boundaries. Instead we regex out (itemId, itemPrice) pairs in their
// document order, which mirrors the server's sort. With
// `sortType=LOW_PRICE` the first row matching the requested itemId is the
// minimum; with `sortType=HIGH_PRICE` it's the maximum.
//
// The search itself is a substring match on `searchWord`, so a query for
// "Carta de Andre" also matches "Carta de Andre Doce". Filtering on
// `itemId` here keeps us honest.

use std::sync::OnceLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

#[derive(Serialize, Clone, Debug)]
pub struct MarketExtremes {
    pub min: Option<u64>,
    pub max: Option<u64>,
}

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "UPPERCASE")]
pub enum Server {
    Freya,
    Nidhogg,
}

impl Server {
    fn as_param(self) -> &'static str {
        match self {
            Server::Freya => "FREYA",
            Server::Nidhogg => "NIDHOGG",
        }
    }
}

fn market_url(item_name: &str, server: Server, sort: &str) -> String {
    let word = urlencode(item_name);
    let svr = server.as_param();
    format!(
        "https://ro.gnjoylatam.com/pt/intro/shop-search/trading\
         ?storeType=BUY&serverType={svr}&searchWord={word}&sortType={sort}&p=1"
    )
}

// reqwest doesn't expose a url-encoder, and we don't want the
// `percent-encoding` crate just for two strings. Encode every byte that
// isn't unreserved per RFC 3986.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn price_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Each row contains, in order: `\"itemId\":N` ... `\"itemPrice\":M`.
        Regex::new(r#"\\"itemId\\":(\d+)[^}]*?\\"itemPrice\\":(\d+)"#)
            .expect("static regex pattern must compile")
    })
}

// reqwest::Client owns a connection pool; we keep one for the whole
// process so consecutive market lookups share keep-alive and TLS setup.
fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let c = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client build: {e}"))?;
    Ok(CLIENT.get_or_init(|| c))
}

fn first_price_for_id(html: &str, item_id: u32) -> Option<u64> {
    for cap in price_regex().captures_iter(html) {
        let id: u32 = cap.get(1)?.as_str().parse().ok()?;
        if id != item_id {
            continue;
        }
        let price: u64 = cap.get(2)?.as_str().parse().ok()?;
        return Some(price);
    }
    None
}

async fn fetch_html(url: String) -> Result<String, String> {
    let client = http_client()?;
    let res = client
        .get(&url)
        .header("accept", "text/html")
        .header("accept-language", "pt-BR,pt;q=0.9,en-US;q=0.8")
        .send()
        .await
        .map_err(|e| format!("request: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    res.text().await.map_err(|e| format!("body: {e}"))
}

#[tauri::command]
pub async fn fetch_market_extremes(
    item_id: u32,
    item_name: String,
    server: Server,
) -> Result<MarketExtremes, String> {
    if item_id == 0 || item_name.is_empty() {
        return Err("itemId and itemName required".into());
    }

    let low_url = market_url(&item_name, server, "LOW_PRICE");
    let high_url = market_url(&item_name, server, "HIGH_PRICE");

    let (low_html, high_html) = tokio::join!(fetch_html(low_url), fetch_html(high_url));
    let low_html = low_html?;
    let high_html = high_html?;

    Ok(MarketExtremes {
        min: first_price_for_id(&low_html, item_id),
        max: first_price_for_id(&high_html, item_id),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_first_matching_price() {
        // Synthetic payload mimicking the escaped-JSON-in-HTML form.
        let html = r#"junk \"itemId\":99,\"mapId\":1,\"itemPrice\":50 more \"itemId\":4423,\"mapId\":835,\"itemPrice\":10000 then \"itemId\":4423,\"itemPrice\":20000"#;
        assert_eq!(first_price_for_id(html, 4423), Some(10000));
        assert_eq!(first_price_for_id(html, 99), Some(50));
        assert_eq!(first_price_for_id(html, 7), None);
    }

    #[test]
    fn urlencode_handles_accents_and_spaces() {
        // "Poção Vermelha" → Po%C3%A7%C3%A3o%20Vermelha
        assert_eq!(urlencode("Poção Vermelha"), "Po%C3%A7%C3%A3o%20Vermelha");
    }

    #[test]
    fn server_param_matches_upstream_casing() {
        assert_eq!(Server::Freya.as_param(), "FREYA");
        assert_eq!(Server::Nidhogg.as_param(), "NIDHOGG");
    }
}
