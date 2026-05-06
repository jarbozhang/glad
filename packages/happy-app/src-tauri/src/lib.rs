mod tray;
mod notifications;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let port: u16 = portpicker::pick_unused_port().expect("failed to find unused port");
  let local_url = tauri::Url::parse(&format!("http://localhost:{port}"))
    .expect("failed to parse localhost URL");

  tauri::Builder::default()
    .plugin(tauri_plugin_localhost::Builder::new(port).build())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      tray::update_tray_status,
      notifications::send_notification,
    ])
    .setup(move |app| {
      // Setup system tray
      tray::setup_tray(app.handle())?;
      if !cfg!(debug_assertions) {
        if let Some(webview) = app.get_webview_window("main") {
          webview.navigate(local_url.clone())?;
        }
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        #[cfg(target_os = "macos")]
        {
          api.prevent_close();
          let _ = window.hide();
        }

        #[cfg(not(target_os = "macos"))]
        {
          let _ = window;
          let _ = api;
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
