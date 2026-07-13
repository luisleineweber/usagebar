#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Command {
    Usage(CommonArgs),
    History(HistoryArgs),
    Statusline(CommonArgs),
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct CommonArgs {
    pub json: bool,
    pub provider: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct HistoryArgs {
    pub common: CommonArgs,
    pub days: u16,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ParsedArgs {
    Command(Command),
    Help,
    Version,
}

pub(crate) fn parse(args: impl IntoIterator<Item = String>) -> Result<ParsedArgs, String> {
    let mut args = args.into_iter();
    let Some(command) = args.next() else {
        return Ok(ParsedArgs::Help);
    };
    if matches!(command.as_str(), "-h" | "--help" | "help") {
        return Ok(ParsedArgs::Help);
    }
    if matches!(command.as_str(), "-V" | "--version" | "version") {
        return Ok(ParsedArgs::Version);
    }

    let mut common = CommonArgs::default();
    let mut days = 30_u16;
    let mut days_seen = false;
    let mut remaining = args.peekable();
    while let Some(argument) = remaining.next() {
        match argument.as_str() {
            "--json" => {
                if common.json {
                    return Err("--json may only be specified once".to_string());
                }
                common.json = true;
            }
            "--provider" => {
                if common.provider.is_some() {
                    return Err("--provider may only be specified once".to_string());
                }
                let provider = remaining
                    .next()
                    .ok_or_else(|| "--provider requires a provider id".to_string())?;
                let provider = provider.trim().to_ascii_lowercase();
                if provider.is_empty() || provider.starts_with('-') {
                    return Err("--provider requires a provider id".to_string());
                }
                common.provider = Some(provider);
            }
            "--days" => {
                if command != "history" {
                    return Err("--days is only valid with the history command".to_string());
                }
                if days_seen {
                    return Err("--days may only be specified once".to_string());
                }
                let value = remaining
                    .next()
                    .ok_or_else(|| "--days requires a number from 1 to 3650".to_string())?;
                days = value
                    .parse::<u16>()
                    .ok()
                    .filter(|days| (1..=3650).contains(days))
                    .ok_or_else(|| "--days requires a number from 1 to 3650".to_string())?;
                days_seen = true;
            }
            "-h" | "--help" => return Ok(ParsedArgs::Help),
            _ => return Err(format!("unknown argument '{argument}'")),
        }
    }

    let command = match command.as_str() {
        "usage" => Command::Usage(common),
        "history" => Command::History(HistoryArgs { common, days }),
        "statusline" => Command::Statusline(common),
        _ => return Err(format!("unknown command '{command}'")),
    };
    Ok(ParsedArgs::Command(command))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn parses_history_flags_in_any_order() {
        assert_eq!(
            parse(args(&[
                "history",
                "--days",
                "7",
                "--provider",
                "Claude",
                "--json"
            ])),
            Ok(ParsedArgs::Command(Command::History(HistoryArgs {
                common: CommonArgs {
                    json: true,
                    provider: Some("claude".to_string()),
                },
                days: 7,
            })))
        );
    }

    #[test]
    fn rejects_days_for_non_history_commands() {
        assert_eq!(
            parse(args(&["usage", "--days", "7"])),
            Err("--days is only valid with the history command".to_string())
        );
    }

    #[test]
    fn rejects_unknown_commands_and_flags() {
        assert_eq!(
            parse(args(&["refresh"])),
            Err("unknown command 'refresh'".to_string())
        );
        assert_eq!(
            parse(args(&["usage", "--refresh"])),
            Err("unknown argument '--refresh'".to_string())
        );
    }
}
