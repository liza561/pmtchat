use std::path::PathBuf;

pub fn instance_name() -> String {
    std::env::var("PINGO_INSTANCE")
        .unwrap_or_default()
        .trim()
        .to_string()
}

pub fn instance_data_dir() -> PathBuf {
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."));

    let instance = instance_name();

    if instance.is_empty() {
        base.join("Pingo")
    } else {
        base.join(format!("Pingo_{}", instance))
    }
}

pub fn instance_port(variable: &str, default: u16) -> u16 {
    std::env::var(variable)
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(default)
}