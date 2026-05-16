// Capture engine using WinDivert in sniff mode.
//
// Raw sockets with SIO_RCVALL on Windows cannot see inbound TCP segments
// belonging to an established connection — the kernel TCP stack consumes them
// before they reach the raw socket. WinDivert hooks at the WFP layer below
// the TCP stack, so it sees both directions.
//
// Sniff mode (WINDIVERT_FLAG_SNIFF) means we observe-only; packets continue
// on to the kernel TCP stack unchanged. The app never injects or modifies
// any packet.

use crate::NetworkInterface;
use serde::Serialize;
use std::ffi::{c_void, CString};
use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Handles are stored as `usize` so they can cross thread boundaries safely.
/// `WinDivertShutdown` is documented as thread-safe and unblocks a concurrent
/// `WinDivertRecv` on the same handle.
pub struct CaptureState {
    pub running: Arc<AtomicBool>,
    pub handle: Arc<Mutex<Option<usize>>>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            handle: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct PacketEvent {
    pub src_ip: String,
    pub src_port: u16,
    pub dst_ip: String,
    pub dst_port: u16,
    pub payload_hex: String,
}

#[derive(Serialize, Clone)]
pub struct CaptureStats {
    pub packets_seen: u64,
    pub matched: u64,
}

fn is_target_port(port: u16) -> bool {
    matches!(port, 6900 | 6951 | 4500) || (22000..=22100).contains(&port)
}

// ---------- interface enumeration ----------

#[cfg(windows)]
pub fn list_interfaces() -> io::Result<Vec<NetworkInterface>> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::NetworkManagement::IpHelper::{
        GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
        GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH,
    };
    use windows::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN};

    const BUF_INITIAL: u32 = 16 * 1024;
    const ERROR_BUFFER_OVERFLOW: u32 = 111;
    let mut size = BUF_INITIAL;
    let mut buf: Vec<u8> = vec![0; size as usize];

    let flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;

    for _ in 0..3 {
        let rc = unsafe {
            GetAdaptersAddresses(
                AF_INET.0 as u32,
                flags,
                None,
                Some(buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH),
                &mut size,
            )
        };
        if rc == 0 {
            break;
        }
        if rc == ERROR_BUFFER_OVERFLOW {
            buf.resize(size as usize, 0);
            continue;
        }
        return Err(io::Error::from_raw_os_error(rc as i32));
    }

    let mut out: Vec<NetworkInterface> = Vec::new();
    let mut ptr = buf.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
    while !ptr.is_null() {
        let adapter = unsafe { &*ptr };
        let index = unsafe { adapter.Anonymous1.Anonymous.IfIndex };

        let mut name = String::new();
        if !adapter.FriendlyName.is_null() {
            let mut wide: Vec<u16> = Vec::new();
            let mut p = adapter.FriendlyName.as_ptr();
            unsafe {
                while *p != 0 {
                    wide.push(*p);
                    p = p.add(1);
                }
            }
            name = OsString::from_wide(&wide).to_string_lossy().to_string();
        }

        let mut ipv4 = String::new();
        let mut unicast_ptr = adapter.FirstUnicastAddress;
        while !unicast_ptr.is_null() {
            let u = unsafe { &*unicast_ptr };
            let sa = unsafe { &*u.Address.lpSockaddr };
            if sa.sa_family == AF_INET {
                let sin = unsafe { &*(u.Address.lpSockaddr as *const SOCKADDR_IN) };
                let bytes = unsafe { sin.sin_addr.S_un.S_un_b };
                ipv4 = format!(
                    "{}.{}.{}.{}",
                    bytes.s_b1, bytes.s_b2, bytes.s_b3, bytes.s_b4
                );
                break;
            }
            unicast_ptr = u.Next;
        }

        let is_loopback = ipv4.starts_with("127.");

        if !ipv4.is_empty() {
            out.push(NetworkInterface {
                index,
                name,
                ipv4,
                is_loopback,
            });
        }

        ptr = adapter.Next;
    }

    Ok(out)
}

#[cfg(not(windows))]
pub fn list_interfaces() -> io::Result<Vec<NetworkInterface>> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "ragmarket only supports Windows",
    ))
}

// ---------- WinDivert FFI ----------

const WINDIVERT_LAYER_NETWORK: i32 = 0;
const WINDIVERT_FLAG_SNIFF: u64 = 0x0001;
const WINDIVERT_FLAG_RECV_ONLY: u64 = 0x0004; // never inject (read-only)
const WINDIVERT_SHUTDOWN_BOTH: i32 = 0x3;

type HANDLE = *mut c_void;
const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;

#[link(name = "WinDivert")]
extern "system" {
    fn WinDivertOpen(
        filter: *const i8,
        layer: i32,
        priority: i16,
        flags: u64,
    ) -> HANDLE;
    fn WinDivertRecv(
        handle: HANDLE,
        packet: *mut u8,
        packet_len: u32,
        recv_len: *mut u32,
        addr: *mut WinDivertAddress,
    ) -> i32;
    fn WinDivertClose(handle: HANDLE) -> i32;
    fn WinDivertShutdown(handle: HANDLE, how: i32) -> i32;
}

#[repr(C)]
#[derive(Clone, Copy)]
struct WinDivertAddress {
    timestamp: i64,
    _layer_event_bits: u32,
    _padding: u32,
    _payload: [u8; 64], // union payload — we don't read it
}

impl Default for WinDivertAddress {
    fn default() -> Self {
        Self {
            timestamp: 0,
            _layer_event_bits: 0,
            _padding: 0,
            _payload: [0u8; 64],
        }
    }
}

// ---------- capture loop ----------

#[cfg(windows)]
pub fn start_capture(
    app: AppHandle,
    state: State<CaptureState>,
    _ipv4: String,
) -> Result<(), String> {
    let running = state.running.clone();
    if running.swap(true, Ordering::SeqCst) {
        return Err("capture already running".into());
    }

    let handle_store = state.handle.clone();
    std::thread::spawn(move || {
        if let Err(e) = capture_loop(app.clone(), running.clone(), handle_store) {
            let _ = app.emit("capture-error", e.to_string());
        }
        running.store(false, Ordering::SeqCst);
        let _ = app.emit("capture-stopped", ());
    });

    Ok(())
}

#[cfg(not(windows))]
pub fn start_capture(
    _app: AppHandle,
    _state: State<CaptureState>,
    _ipv4: String,
) -> Result<(), String> {
    Err("Windows only".into())
}

pub fn stop_capture(state: State<CaptureState>) -> Result<(), String> {
    state.running.store(false, Ordering::SeqCst);
    // Take the handle from the store. If still present, signal WinDivert to
    // unblock the recv loop. The capture thread will then exit naturally and
    // close the handle in its cleanup. The Mutex serialises ownership, so the
    // capture thread won't double-shutdown or double-close.
    let handle_opt = {
        let guard = state.handle.lock().unwrap();
        // We only take a *copy* here, leaving the handle in place so the
        // capture loop can still find and close it. The shutdown wakes recv;
        // the close still happens on the capture-thread side.
        *guard
    };
    if let Some(h) = handle_opt {
        unsafe {
            WinDivertShutdown(h as HANDLE, WINDIVERT_SHUTDOWN_BOTH);
        }
    }
    Ok(())
}

#[cfg(windows)]
fn capture_loop(
    app: AppHandle,
    running: Arc<AtomicBool>,
    handle_store: Arc<Mutex<Option<usize>>>,
) -> io::Result<()> {
    // WinDivert filter language uses C-style `&&` and `||`, not `and`/`or`.
    let filter = "tcp && (tcp.SrcPort == 6900 || tcp.DstPort == 6900 \
                       || tcp.SrcPort == 6951 || tcp.DstPort == 6951 \
                       || tcp.SrcPort == 4500 || tcp.DstPort == 4500 \
                       || (tcp.SrcPort >= 22000 && tcp.SrcPort <= 22100) \
                       || (tcp.DstPort >= 22000 && tcp.DstPort <= 22100))";

    let filter_c = CString::new(filter).expect("filter contains NUL byte");
    eprintln!("[capture] opening WinDivert handle (filter: {filter})");

    let handle = unsafe {
        WinDivertOpen(
            filter_c.as_ptr(),
            WINDIVERT_LAYER_NETWORK,
            0,
            WINDIVERT_FLAG_SNIFF | WINDIVERT_FLAG_RECV_ONLY,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        let err = io::Error::last_os_error();
        eprintln!("[capture] WinDivertOpen failed: {err}");
        return Err(err);
    }
    eprintln!("[capture] WinDivert handle opened. Entering recv loop...");

    // Publish the handle so `stop_capture` can call `WinDivertShutdown` on it.
    *handle_store.lock().unwrap() = Some(handle as usize);

    let _ = app.emit("capture-started", ());

    let mut stats = CaptureStats {
        packets_seen: 0,
        matched: 0,
    };
    let mut last_stats_emit = std::time::Instant::now();
    let mut last_progress_log = std::time::Instant::now();
    let mut packet = vec![0u8; 65535];
    let mut addr = WinDivertAddress::default();

    let mut recv_err: Option<io::Error> = None;

    while running.load(Ordering::SeqCst) {
        let mut recv_len: u32 = 0;
        let rc = unsafe {
            WinDivertRecv(
                handle,
                packet.as_mut_ptr(),
                packet.len() as u32,
                &mut recv_len,
                &mut addr,
            )
        };
        if rc == 0 {
            // recv failed. If we're shutting down (or shutdown was signaled),
            // exit cleanly; otherwise propagate the error.
            if !running.load(Ordering::SeqCst) {
                break;
            }
            recv_err = Some(io::Error::last_os_error());
            eprintln!("[capture] WinDivertRecv failed: {:?}", recv_err);
            break;
        }

        let datagram = &packet[..recv_len as usize];
        stats.packets_seen += 1;

        if let Some(ev) = parse_and_filter(datagram) {
            stats.matched += 1;
            let _ = app.emit("packet-bytes", ev);
        }

        if last_stats_emit.elapsed() >= std::time::Duration::from_millis(500) {
            let _ = app.emit("capture-stats", stats.clone());
            last_stats_emit = std::time::Instant::now();
        }

        if last_progress_log.elapsed() >= std::time::Duration::from_secs(5) {
            eprintln!(
                "[capture] progress: packets_seen={}, matched={}",
                stats.packets_seen, stats.matched,
            );
            last_progress_log = std::time::Instant::now();
        }
    }

    eprintln!(
        "[capture] stopping. final: packets_seen={}, matched={}",
        stats.packets_seen, stats.matched,
    );
    let _ = app.emit("capture-stats", stats.clone());

    // Take ownership of the handle for closing. If `stop_capture` already
    // observed the handle in the mutex, our `take()` here still wins for the
    // close because `WinDivertClose` is only ever called from this thread.
    let to_close = handle_store.lock().unwrap().take();
    if let Some(h) = to_close {
        unsafe {
            WinDivertClose(h as HANDLE);
        }
    }

    if let Some(e) = recv_err {
        return Err(e);
    }
    Ok(())
}

#[cfg(windows)]
fn parse_and_filter(datagram: &[u8]) -> Option<PacketEvent> {
    let ip = crate::packet::parse_ipv4(datagram)?;
    if ip.proto != 6 {
        return None;
    }
    if ip.header_len > ip.total_len {
        return None;
    }
    let tcp_buf = &datagram[ip.header_len..ip.total_len];
    let tcp = crate::packet::parse_tcp(tcp_buf)?;
    if !is_target_port(tcp.src_port) && !is_target_port(tcp.dst_port) {
        return None;
    }
    if tcp.payload.is_empty() {
        return None;
    }
    Some(PacketEvent {
        src_ip: format!(
            "{}.{}.{}.{}",
            ip.src[0], ip.src[1], ip.src[2], ip.src[3]
        ),
        src_port: tcp.src_port,
        dst_ip: format!(
            "{}.{}.{}.{}",
            ip.dst[0], ip.dst[1], ip.dst[2], ip.dst[3]
        ),
        dst_port: tcp.dst_port,
        payload_hex: hex::encode(&tcp.payload),
    })
}
