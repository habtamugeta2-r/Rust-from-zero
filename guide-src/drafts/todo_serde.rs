use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Priority {
    Low,
    #[default]
    Normal,
    High,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Task {
    id: u32,
    title: String,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    priority: Priority,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct TodoFile {
    version: u32,
    tasks: Vec<Task>,
}

fn save(path: &Path, list: &TodoFile) -> Result<()> {
    let text = serde_json::to_string_pretty(list).context("could not convert the list to JSON")?;
    fs::write(path, text).with_context(|| format!("could not write {}", path.display()))
}

fn load(path: &Path) -> Result<TodoFile> {
    let text = fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("{} is not a valid to-do file", path.display()))
}

fn main() -> Result<()> {
    let path = Path::new("todo_demo.json");

    let list = TodoFile {
        version: 1,
        tasks: vec![
            Task { id: 1, title: String::from("buy milk"), done: true, priority: Priority::Low, tags: vec![] },
            Task {
                id: 2,
                title: String::from("learn serde"),
                done: false,
                priority: Priority::High,
                tags: vec![String::from("rust")],
            },
        ],
    };

    save(path, &list)?;
    println!("{}", fs::read_to_string(path)?);

    let loaded = load(path)?;
    println!("same as before: {}", loaded == list);

    // An older file without the newer fields still loads
    fs::write(path, r#"{ "version": 1, "tasks": [ { "id": 7, "title": "old task" } ] }"#)?;
    println!("{:?}", load(path)?.tasks[0]);

    // A broken file gives a helpful error
    fs::write(path, r#"{ "version": 1, "tasks": [ { "id": "seven", "title": "x" } ] }"#)?;
    if let Err(error) = load(path) {
        println!("error: {error:#}");
    }

    fs::remove_file(path)?;
    Ok(())
}
