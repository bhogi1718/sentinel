use serde::Serialize;
use std::collections::HashMap;

/// Mirrors the backend's Prisma `EventType` enum exactly (see
/// backend/prisma/schema.prisma). Serialized as the same uppercase strings
/// the backend's Zod schema expects on `event:report`.
#[derive(Debug, Clone, Copy, Serialize)]
pub enum EventType {
    Boot,
    Shutdown,
    Restart,
    Lock,
    Unlock,
    Sleep,
    Wake,
    InternetConnected,
    InternetDisconnected,
    BatteryLow,
}

impl EventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventType::Boot => "BOOT",
            EventType::Shutdown => "SHUTDOWN",
            EventType::Restart => "RESTART",
            EventType::Lock => "LOCK",
            EventType::Unlock => "UNLOCK",
            EventType::Sleep => "SLEEP",
            EventType::Wake => "WAKE",
            EventType::InternetConnected => "INTERNET_CONNECTED",
            EventType::InternetDisconnected => "INTERNET_DISCONNECTED",
            EventType::BatteryLow => "BATTERY_LOW",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ReportedEvent {
    #[serde(rename = "type")]
    pub event_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

impl ReportedEvent {
    pub fn new(event_type: EventType) -> Self {
        Self {
            event_type: event_type.as_str(),
            metadata: None,
        }
    }

    pub fn with_metadata(event_type: EventType, metadata: HashMap<String, serde_json::Value>) -> Self {
        Self {
            event_type: event_type.as_str(),
            metadata: Some(metadata),
        }
    }
}
