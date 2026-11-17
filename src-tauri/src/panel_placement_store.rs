//! Persistence for the opt-in movable tray panel.
//!
//! The file stores whether the panel is movable and the physical
//! virtual-screen origin the user moved it to. A missing file means the
//! default: anchored to the tray. A malformed file is reported and replaced on
//! the next write.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

pub(crate) const PANEL_PLACEMENT_FILE_NAME: &str = "panel-placement.json";
const SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FloatingOrigin {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct PanelPlacement {
    pub movable: bool,
    /// Present only after the user moved the panel while `movable` is on.
    pub floating_origin: Option<FloatingOrigin>,
}

impl PanelPlacement {
    /// The origin to use now. A stored origin is ignored while movable is off.
    pub(crate) fn active_floating_origin(&self) -> Option<FloatingOrigin> {
        if self.movable {
            self.floating_origin
        } else {
            None
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PanelPlacementFile {
    version: u32,
    movable: bool,
    floating_origin: Option<FloatingOrigin>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PlacementLoadError {
    Read(String),
    Parse(String),
    UnsupportedVersion(u32),
}

impl std::fmt::Display for PlacementLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Read(error) => write!(f, "could not read panel placement: {error}"),
            Self::Parse(error) => write!(f, "panel placement file is malformed: {error}"),
            Self::UnsupportedVersion(version) => {
                write!(f, "panel placement file has unsupported version {version}")
            }
        }
    }
}

pub(crate) fn parse_placement(contents: &str) -> Result<PanelPlacement, PlacementLoadError> {
    let file: PanelPlacementFile = serde_json::from_str(contents)
        .map_err(|error| PlacementLoadError::Parse(error.to_string()))?;
    if file.version != SCHEMA_VERSION {
        return Err(PlacementLoadError::UnsupportedVersion(file.version));
    }
    Ok(PanelPlacement {
        movable: file.movable,
        floating_origin: file.floating_origin,
    })
}

pub(crate) fn serialize_placement(placement: &PanelPlacement) -> String {
    let file = PanelPlacementFile {
        version: SCHEMA_VERSION,
        movable: placement.movable,
        floating_origin: placement.floating_origin,
    };
    serde_json::to_string_pretty(&file).expect("panel placement serializes")
}

/// Read the placement file. A missing file is the default placement.
pub(crate) fn load_from(path: &Path) -> Result<PanelPlacement, PlacementLoadError> {
    match std::fs::read_to_string(path) {
        Ok(contents) => parse_placement(&contents),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(PanelPlacement::default()),
        Err(error) => Err(PlacementLoadError::Read(error.to_string())),
    }
}

pub(crate) fn save_to(path: &Path, placement: &PanelPlacement) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    crate::atomic_file::write(path, serialize_placement(placement).as_bytes())
}

struct PlacementSlot {
    path: PathBuf,
    placement: PanelPlacement,
}

fn slot() -> &'static Mutex<Option<PlacementSlot>> {
    static SLOT: OnceLock<Mutex<Option<PlacementSlot>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Load the placement from `app_data_dir` once at startup.
pub(crate) fn init(app_data_dir: &Path) {
    let path = app_data_dir.join(PANEL_PLACEMENT_FILE_NAME);
    let placement = match load_from(&path) {
        Ok(placement) => placement,
        Err(error) => {
            log::error!(
                "{error}; the panel stays anchored to the tray until the setting is saved again"
            );
            PanelPlacement::default()
        }
    };
    if let Ok(mut slot) = slot().lock() {
        *slot = Some(PlacementSlot { path, placement });
    }
}

/// The current placement. Before `init`, this is the anchored default.
pub(crate) fn current() -> PanelPlacement {
    slot()
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|slot| slot.placement))
        .unwrap_or_default()
}

/// Apply `change`, persist the result, and return it.
pub(crate) fn update(change: impl FnOnce(&mut PanelPlacement)) -> Result<PanelPlacement, String> {
    let mut guard = slot()
        .lock()
        .map_err(|_| "panel placement state is unavailable".to_string())?;
    let slot = guard
        .as_mut()
        .ok_or_else(|| "panel placement is not initialized".to_string())?;
    let mut next = slot.placement;
    change(&mut next);
    if next == slot.placement {
        return Ok(next);
    }
    save_to(&slot.path, &next)
        .map_err(|error| format!("could not save panel placement: {error}"))?;
    slot.placement = next;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "usagebar-panel-placement-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn default_is_anchored_and_not_movable() {
        let placement = PanelPlacement::default();
        assert!(!placement.movable);
        assert_eq!(placement.active_floating_origin(), None);
    }

    #[test]
    fn missing_file_loads_the_anchored_default() {
        let dir = temp_dir("missing");
        assert_eq!(
            load_from(&dir.join(PANEL_PLACEMENT_FILE_NAME)),
            Ok(PanelPlacement::default())
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn saved_negative_origin_round_trips() {
        let dir = temp_dir("round-trip");
        let path = dir.join(PANEL_PLACEMENT_FILE_NAME);
        let placement = PanelPlacement {
            movable: true,
            floating_origin: Some(FloatingOrigin { x: -2548, y: -188 }),
        };
        save_to(&path, &placement).expect("save");
        assert_eq!(load_from(&path), Ok(placement));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn stored_origin_is_inactive_while_movable_is_off() {
        let placement = PanelPlacement {
            movable: false,
            floating_origin: Some(FloatingOrigin { x: 10, y: 20 }),
        };
        assert_eq!(placement.active_floating_origin(), None);
    }

    #[test]
    fn file_format_is_versioned_camel_case() {
        let json = serialize_placement(&PanelPlacement {
            movable: true,
            floating_origin: Some(FloatingOrigin { x: 1, y: -2 }),
        });
        let value: serde_json::Value = serde_json::from_str(&json).expect("json");
        assert_eq!(
            value,
            serde_json::json!({
                "version": 1,
                "movable": true,
                "floatingOrigin": { "x": 1, "y": -2 }
            })
        );
    }

    #[test]
    fn malformed_and_unknown_versions_are_errors_not_defaults() {
        assert!(matches!(
            parse_placement("{ not json"),
            Err(PlacementLoadError::Parse(_))
        ));
        assert!(matches!(
            parse_placement(r#"{"version":1,"movable":"yes","floatingOrigin":null}"#),
            Err(PlacementLoadError::Parse(_))
        ));
        assert_eq!(
            parse_placement(r#"{"version":2,"movable":true,"floatingOrigin":null}"#),
            Err(PlacementLoadError::UnsupportedVersion(2))
        );
    }
}
