use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DataFreshness {
    pub state: DataFreshnessState,
    pub observed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DataFreshnessState {
    Fresh,
    Retained,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DataFreshnessGroups {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota: Option<DataFreshness>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<DataFreshness>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<DataFreshness>,
}

impl DataFreshness {
    pub fn fresh(observed_at: impl Into<String>) -> Self {
        Self {
            state: DataFreshnessState::Fresh,
            observed_at: observed_at.into(),
        }
    }

    pub fn retained_from(previous: &Self) -> Self {
        Self {
            state: DataFreshnessState::Retained,
            observed_at: previous.observed_at.clone(),
        }
    }
}
