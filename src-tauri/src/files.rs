// Native "save as…" dialog backed by tauri-plugin-dialog.
//
// The webview's blob-anchor download trick does nothing under WebView2 —
// it silently no-ops. So whenever the frontend wants to write a file the
// user picked a path for, it invokes this command instead.

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

#[derive(Deserialize)]
pub struct SaveFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    default_name: String,
    contents: String,
    filters: Vec<SaveFilter>,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut builder = app.dialog().file().set_file_name(&default_name);
    for f in &filters {
        let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(&f.name, &exts);
    }
    builder.save_file(move |path| {
        let _ = tx.send(path);
    });

    let chosen = rx.await.map_err(|e| format!("dialog closed: {e}"))?;
    let path = match chosen {
        Some(FilePath::Path(p)) => p,
        Some(FilePath::Url(_)) => return Err("dialog returned a URL, not a path".into()),
        None => return Ok(None),
    };
    std::fs::write(&path, contents).map_err(|e| format!("write: {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
