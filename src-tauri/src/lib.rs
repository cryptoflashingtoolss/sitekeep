#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // HTTP from Rust side: lets the app call the Blackbox API without browser CORS limits.
        .plugin(tauri_plugin_http::init())
        // Copy passwords and clear the clipboard again afterwards.
        .plugin(tauri_plugin_clipboard_manager::init())
        // Reminders for overdue tasks and renewals.
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running SiteKeep");
}
