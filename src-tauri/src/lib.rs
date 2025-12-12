use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
async fn open_player_window(app: tauri::AppHandle) -> Result<(), String> {
    // Check if window already exists
    if app.get_webview_window("player").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "player", WebviewUrl::App("index.html".into()))
        .title("VTT - Player View")
        .inner_size(1920.0, 1080.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![open_player_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
