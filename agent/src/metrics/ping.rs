use std::net::Ipv4Addr;
use windows::Win32::NetworkManagement::IpHelper::{
    IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho, ICMP_ECHO_REPLY,
};

const PING_TIMEOUT_MS: u32 = 2000;
const REQUEST_DATA: &[u8] = b"sentinel";

/// Sends a single ICMP echo request and returns the round-trip time in
/// milliseconds, or None if the ping fails/times out (e.g. no internet, or
/// the target silently drops ICMP). IcmpSendEcho requires no special
/// privileges - unlike a raw ICMP socket, this is the normal unprivileged
/// Windows ping mechanism (what ping.exe itself uses under the hood).
pub fn ping_once(target: Ipv4Addr) -> Option<u32> {
    unsafe {
        let handle = IcmpCreateFile().ok()?;

        // Microsoft's documented reply buffer size: one ICMP_ECHO_REPLY
        // struct, plus room for the echoed request data, plus 8 bytes of
        // padding for the ICMP header.
        let reply_size = std::mem::size_of::<ICMP_ECHO_REPLY>() + REQUEST_DATA.len() + 8;
        let mut reply_buffer = vec![0u8; reply_size];

        // IPAddr expects the octets in the same byte order as struct
        // in_addr.S_addr - on a little-endian host that's from_ne_bytes,
        // not from_be_bytes (which would flip the address).
        let destination = u32::from_ne_bytes(target.octets());

        let reply_count = IcmpSendEcho(
            handle,
            destination,
            REQUEST_DATA.as_ptr() as *const core::ffi::c_void,
            REQUEST_DATA.len() as u16,
            None,
            reply_buffer.as_mut_ptr() as *mut core::ffi::c_void,
            reply_size as u32,
            PING_TIMEOUT_MS,
        );

        let _ = IcmpCloseHandle(handle);

        if reply_count == 0 {
            return None;
        }

        let reply = &*(reply_buffer.as_ptr() as *const ICMP_ECHO_REPLY);
        // Status 0 (IP_SUCCESS) is the only status that guarantees
        // RoundTripTime is meaningful - anything else (unreachable, TTL
        // expired, etc.) still counts as a reply_count > 0 but isn't a
        // real successful ping.
        if reply.Status != 0 {
            return None;
        }

        Some(reply.RoundTripTime)
    }
}
