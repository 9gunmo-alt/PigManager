#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

struct ServerProcess {
    child: Child,
    stdin: std::process::ChildStdin,
    #[allow(dead_code)]
    pid: u32,
}

struct AppState {
    servers: Arc<Mutex<HashMap<String, ServerProcess>>>,
    // CPU 사용률 계산용 직전 측정값 (시스템 전체): (idle, total)
    cpu_prev: Arc<Mutex<Option<(u64, u64)>>>,
    // 서버별 최근 TPS (콘솔 tps 명령 출력에서 파싱)
    tps: Arc<Mutex<HashMap<String, f64>>>,
}

#[tauri::command]
fn start_server(
    id: String,
    jar_path: String,
    server_dir: String,
    ram_mb: u32,
    java_path: Option<String>,
    state: State<AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut map = state.servers.lock().unwrap();
    if map.contains_key(&id) {
        return Err("이미 실행 중입니다.".into());
    }

    let java_exe = java_path.unwrap_or_else(|| "java".to_string());
    let mut child = Command::new(&java_exe)
        .args([
            format!("-Xmx{}M", ram_mb),
            format!("-Xms{}M", ram_mb / 2),
            "-jar".to_string(),
            jar_path.clone(),
            "--nogui".to_string(),
        ])
        .current_dir(&server_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("서버 실행 실패: {}", e))?;

    let pid = child.id();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let stdin = child.stdin.take().unwrap();

    let id_clone = id.clone();
    let app_clone = app.clone();
    let tps_map = state.tps.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            if let Some(tps_val) = parse_tps(&line) {
                tps_map.lock().unwrap().insert(id_clone.clone(), tps_val);
                let _ = app_clone.emit("server-tps",
                    serde_json::json!({ "id": id_clone, "tps": tps_val }));
            }
            let level = classify_log(&line);
            let _ = app_clone.emit("server-log",
                serde_json::json!({ "id": id_clone, "line": line, "level": level }));
        }
    });

    let id_clone2 = id.clone();
    let app_clone2 = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let _ = app_clone2.emit("server-log",
                serde_json::json!({ "id": id_clone2, "line": line, "level": "ERROR" }));
        }
    });

    let id_clone3 = id.clone();
    let app_clone3 = app.clone();
    let servers_clone = state.servers.clone();
    let tps_clone = state.tps.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = app_clone3.emit("server-status",
            serde_json::json!({ "id": id_clone3, "status": "running" }));
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let mut map = servers_clone.lock().unwrap();
            if let Some(proc) = map.get_mut(&id_clone3) {
                if let Ok(Some(_)) = proc.child.try_wait() {
                    map.remove(&id_clone3);
                    tps_clone.lock().unwrap().remove(&id_clone3);
                    let _ = app_clone3.emit("server-status",
                        serde_json::json!({ "id": id_clone3, "status": "stopped" }));
                    break;
                }
            } else {
                break;
            }
        }
    });

    map.insert(id, ServerProcess { child, stdin, pid });
    Ok(())
}

#[tauri::command]
fn stop_server(id: String, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let mut map = state.servers.lock().unwrap();
    if let Some(proc) = map.get_mut(&id) {
        let _ = writeln!(proc.stdin, "stop");
        let _ = proc.stdin.flush();
        let _ = app.emit("server-status", serde_json::json!({ "id": id, "status": "stopping" }));
        Ok(())
    } else {
        Err("실행 중인 서버가 없습니다.".into())
    }
}

#[tauri::command]
fn kill_server(id: String, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let mut map = state.servers.lock().unwrap();
    if let Some(mut proc) = map.remove(&id) {
        let _ = proc.child.kill();
        state.tps.lock().unwrap().remove(&id);
        let _ = app.emit("server-status", serde_json::json!({ "id": id, "status": "stopped" }));
        Ok(())
    } else {
        Err("실행 중인 서버가 없습니다.".into())
    }
}

#[tauri::command]
fn send_command(id: String, command: String, state: State<AppState>) -> Result<(), String> {
    let mut map = state.servers.lock().unwrap();
    if let Some(proc) = map.get_mut(&id) {
        writeln!(proc.stdin, "{}", command).map_err(|e| e.to_string())?;
        proc.stdin.flush().map_err(|e| e.to_string())
    } else {
        Err("실행 중인 서버가 없습니다.".into())
    }
}

#[tauri::command]
fn is_server_running(id: String, state: State<AppState>) -> bool {
    state.servers.lock().unwrap().contains_key(&id)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<serde_json::Value>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = vec![];
    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        result.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(),
            "path": entry.path().to_string_lossy(),
            "is_dir": meta.is_dir(),
            "size": meta.len(),
        }));
    }
    Ok(result)
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64_encode(&bytes))
}

#[tauri::command]
fn write_file_base64(path: String, data: String) -> Result<(), String> {
    let bytes = base64_decode(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn get_java_info(java_path: &str) -> Option<serde_json::Value> {
    use std::os::windows::process::CommandExt as WinExt;
    let output = std::process::Command::new(java_path)
        .arg("-version")
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    let version_str = String::from_utf8_lossy(&output.stderr).to_string()
        + &String::from_utf8_lossy(&output.stdout).to_string();
    if version_str.is_empty() { return None; }
    let version = parse_java_version(&version_str);
    let vendor = if version_str.contains("Temurin") { "Eclipse Temurin" }
        else if version_str.contains("Microsoft") { "Microsoft" }
        else if version_str.contains("BellSoft") { "BellSoft Liberica" }
        else if version_str.contains("Zulu") { "Azul Zulu" }
        else if version_str.contains("GraalVM") { "GraalVM" }
        else { "Oracle / Other" };
    Some(serde_json::json!({
        "path": java_path,
        "version": version,
        "vendor": vendor,
        "raw": version_str.lines().next().unwrap_or("").trim(),
    }))
}

#[cfg(not(target_os = "windows"))]
fn get_java_info(java_path: &str) -> Option<serde_json::Value> {
    let output = std::process::Command::new(java_path)
        .arg("-version")
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .output()
        .ok()?;
    let version_str = String::from_utf8_lossy(&output.stderr).to_string()
        + &String::from_utf8_lossy(&output.stdout).to_string();
    if version_str.is_empty() { return None; }
    let version = parse_java_version(&version_str);
    Some(serde_json::json!({
        "path": java_path,
        "version": version,
        "vendor": "Unknown",
        "raw": version_str.lines().next().unwrap_or("").trim(),
    }))
}

fn parse_java_version(s: &str) -> String {
    for line in s.lines() {
        let line = line.trim();
        if line.contains("version") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start+1..].find('"') {
                    let ver = &line[start+1..start+1+end];
                    if ver.starts_with("1.") {
                        let parts: Vec<&str> = ver.splitn(3, '.').collect();
                        if parts.len() >= 2 {
                            return format!("Java {}", parts[1]);
                        }
                    }
                    let major = ver.split('.').next().unwrap_or(ver);
                    return format!("Java {}", major);
                }
            }
        }
    }
    "Java ?".to_string()
}

/// 콘솔 로그에서 TPS 값 파싱 (Paper/Purpur: "TPS from last 1m, 5m, 15m: 20.0, 19.9, 20.0")
fn parse_tps(line: &str) -> Option<f64> {
    let lower = line.to_lowercase();
    if !lower.contains("tps from last") && !lower.contains("tps:") {
        return None;
    }
    if let Some(colon_pos) = line.rfind(':') {
        let after = &line[colon_pos + 1..];
        let cleaned: String = after.chars()
            .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',' || c.is_whitespace() || *c == '*')
            .collect();
        let first = cleaned
            .split(|c| c == ',' || c == ' ')
            .map(|s| s.trim().trim_start_matches('*'))
            .find(|s| !s.is_empty());
        if let Some(num_str) = first {
            if let Ok(val) = num_str.parse::<f64>() {
                return Some(val.min(20.0).max(0.0));
            }
        }
    }
    None
}

#[tauri::command]
fn run_git(repo_dir: String, args: Vec<String>) -> Result<String, String> {
    let output = Command::new("git")
        .args(&args)
        .current_dir(&repo_dir)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("git 실행 실패: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

#[tauri::command]
fn git_sync_mods(
    repo_dir: String,
    mods_path: String,
    token: String,
    remote_url: String,
    commit_msg: String,
    server_address: String,
    github_repo_raw: String,
) -> Result<String, String> {
    let _ = &mods_path; // 현재 미사용 (repo_dir 기준으로 스캔)
    let auth_url = if remote_url.starts_with("https://") {
        let without_https = &remote_url["https://".len()..];
        format!("https://{}@{}", token, without_https)
    } else {
        remote_url.clone()
    };

    let mods_dir = std::path::Path::new(&repo_dir).join("mods");
    let mut mod_entries: Vec<serde_json::Value> = vec![];

    if mods_dir.exists() {
        let mut jar_files: Vec<_> = std::fs::read_dir(&mods_dir)
            .map_err(|e| e.to_string())?
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".jar"))
            .collect();
        jar_files.sort_by_key(|e| e.file_name());

        for entry in &jar_files {
            let filename = entry.file_name().to_string_lossy().to_string();
            let name = filename
                .trim_end_matches(".jar")
                .split('-')
                .next()
                .unwrap_or(&filename)
                .to_string();
            let encoded = filename.replace('+', "%2B").replace(' ', "%20");
            let url = format!("{}/mods/{}", github_repo_raw.trim_end_matches('/'), encoded);
            mod_entries.push(serde_json::json!({
                "name": name,
                "filename": filename,
                "url": url,
                "required": true,
            }));
        }
    }

    let props_path = std::path::Path::new(&repo_dir).join("server.properties");
    let mc_version = if props_path.exists() {
        let content = std::fs::read_to_string(&props_path).unwrap_or_default();
        content.lines()
            .find(|l| l.starts_with("motd=") || l.starts_with("level-name="))
            .and_then(|_| {
                if mods_dir.exists() {
                    std::fs::read_dir(&mods_dir).ok()?.flatten()
                        .find(|e| e.file_name().to_string_lossy().to_lowercase().starts_with("fabric-api"))
                        .and_then(|e| {
                            let n = e.file_name().to_string_lossy().to_string();
                            n.split('+').nth(1).map(|s| s.trim_end_matches(".jar").to_string())
                        })
                } else { None }
            })
            .unwrap_or_else(|| "unknown".to_string())
    } else if mods_dir.exists() {
        std::fs::read_dir(&mods_dir).ok()
            .and_then(|rd| {
                rd.flatten().find(|e| {
                    e.file_name().to_string_lossy().to_lowercase().starts_with("fabric-api")
                })
                .and_then(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    n.split('+').nth(1).map(|s| s.trim_end_matches(".jar").to_string())
                })
            })
            .unwrap_or_else(|| "unknown".to_string())
    } else {
        "unknown".to_string()
    };

    let fabric_loader = {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let versions_dir = std::path::Path::new(&appdata).join(".minecraft").join("versions");
        let prefix = "fabric-loader-".to_string();
        let mc_suffix = format!("-{}", mc_version);
        std::fs::read_dir(&versions_dir).ok()
            .and_then(|rd| {
                rd.flatten().find_map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with(&prefix) && name.ends_with(&mc_suffix) {
                        let without_prefix = &name[prefix.len()..];
                        let loader_ver = without_prefix
                            .trim_end_matches(mc_suffix.as_str())
                            .trim_end_matches('-')
                            .to_string();
                        if !loader_ver.is_empty() { Some(loader_ver) } else { None }
                    } else {
                        None
                    }
                })
            })
            .unwrap_or_else(|| "0.19.2".to_string())
    };

    let server_name = {
        let props_path = std::path::Path::new(&repo_dir).join("server.properties");
        std::fs::read_to_string(&props_path).ok()
            .and_then(|text| {
                text.lines()
                    .find(|l| l.starts_with("motd="))
                    .map(|l| l.trim_start_matches("motd=").trim().to_string())
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or_else(|| "MC 서버".to_string())
    };

    let game_dir_path = {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        std::path::Path::new(&appdata)
            .join(".minecraft-modpack")
            .to_string_lossy()
            .to_string()
    };

    let config = serde_json::json!({
        "config_version": "1.0.0",
        "github_config_url": format!("{}/server_config.json", github_repo_raw.trim_end_matches('/')),
        "server_name": server_name,
        "server_address": server_address,
        "minecraft_version": mc_version,
        "fabric_loader_version": fabric_loader,
        "game_dir": &game_dir_path,
        "mods": mod_entries,
    });

    let config_path = std::path::Path::new(&repo_dir).join("server_config.json");
    let config_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, &config_str).map_err(|e| e.to_string())?;

    let _ = Command::new("git").args(["init"]).current_dir(&repo_dir)
        .creation_flags(0x08000000).output();
    let _ = Command::new("git").args(["config", "user.email", "pigmanager@localhost"])
        .current_dir(&repo_dir).creation_flags(0x08000000).output();
    let _ = Command::new("git").args(["config", "user.name", "PigManager"])
        .current_dir(&repo_dir).creation_flags(0x08000000).output();
    let _ = Command::new("git").args(["remote", "remove", "origin"])
        .current_dir(&repo_dir).creation_flags(0x08000000).output();
    Command::new("git").args(["remote", "add", "origin", &auth_url])
        .current_dir(&repo_dir).creation_flags(0x08000000).output()
        .map_err(|e| e.to_string())?;

    let gitignore_path = std::path::Path::new(&repo_dir).join(".gitignore");
    std::fs::write(&gitignore_path, "*\n!mods/\n!mods/**\n!server_config.json\n!.gitignore\n")
        .map_err(|e| e.to_string())?;

    let add_out = Command::new("git")
        .args(["add", "mods/", "server_config.json", ".gitignore"])
        .current_dir(&repo_dir).creation_flags(0x08000000).output()
        .map_err(|e| format!("git add 실패: {}", e))?;
    if !add_out.status.success() {
        return Err(String::from_utf8_lossy(&add_out.stderr).to_string());
    }

    let status_out = Command::new("git").args(["status", "--porcelain"])
        .current_dir(&repo_dir).creation_flags(0x08000000).output()
        .map_err(|e| e.to_string())?;
    if String::from_utf8_lossy(&status_out.stdout).trim().is_empty() {
        return Ok("변경된 내용이 없어요.".to_string());
    }

    let commit_out = Command::new("git")
        .args(["commit", "-m", &commit_msg])
        .current_dir(&repo_dir).creation_flags(0x08000000).output()
        .map_err(|e| format!("git commit 실패: {}", e))?;
    if !commit_out.status.success() {
        let err = String::from_utf8_lossy(&commit_out.stderr).to_string();
        if !err.contains("nothing to commit") {
            return Err(err);
        }
    }

    let push_out = Command::new("git")
        .args(["push", "-u", "origin", "HEAD:main", "--force"])
        .current_dir(&repo_dir).creation_flags(0x08000000).output()
        .map_err(|e| format!("git push 실패: {}", e))?;

    if push_out.status.success() {
        Ok(format!("동기화 완료! 모드 {}개, MC {} 감지됨", mod_entries.len(), mc_version))
    } else {
        Err(String::from_utf8_lossy(&push_out.stderr).to_string())
    }
}

#[tauri::command]
fn detect_java() -> Vec<serde_json::Value> {
    let mut results = vec![];
    let search_bases = vec![
        r"C:\Program Files\Java",
        r"C:\Program Files\Eclipse Adoptium",
        r"C:\Program Files\Microsoft",
        r"C:\Program Files\BellSoft",
        r"C:\Program Files\Zulu",
        r"C:\Program Files (x86)\Java",
    ];
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in path_env.split(';') {
            let java_exe = std::path::Path::new(dir).join("java.exe");
            if java_exe.exists() {
                let path_str = java_exe.to_string_lossy().to_string();
                let already = results.iter().any(|r: &serde_json::Value| r["path"].as_str() == Some(&path_str));
                if !already {
                    if let Some(info) = get_java_info(&path_str) {
                        results.push(info);
                    }
                }
            }
        }
    }
    for base in &search_bases {
        let base_path = std::path::Path::new(base);
        if !base_path.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(base_path) {
            for entry in entries.flatten() {
                let bin_java = entry.path().join("bin").join("java.exe");
                if bin_java.exists() {
                    let path_str = bin_java.to_string_lossy().to_string();
                    let already = results.iter().any(|r: &serde_json::Value| r["path"].as_str() == Some(&path_str));
                    if !already {
                        if let Some(info) = get_java_info(&path_str) {
                            results.push(info);
                        }
                    }
                }
            }
        }
    }
    results
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_server_icon(src_path: String, server_dir: String) -> Result<(), String> {
    use std::path::Path;
    let src = Path::new(&src_path);
    let dest = Path::new(&server_dir).join("server-icon.png");
    std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn accept_eula(server_dir: String) -> Result<(), String> {
    let eula_path = format!("{}\\eula.txt", server_dir);
    std::fs::write(&eula_path, "#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula=true\n")
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_file(url: String, dest_path: String) -> Result<(), String> {
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&dest_path, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_system_stats(state: State<AppState>) -> serde_json::Value {
    #[cfg(target_os = "windows")]
    {
        let (ram_used_gb, ram_total_gb, ram_percent) = get_ram_stats();
        let cpu_percent = get_cpu_percent(&state.cpu_prev);
        serde_json::json!({
            "ram_used_gb": format!("{:.1}", ram_used_gb),
            "ram_total_gb": format!("{:.1}", ram_total_gb),
            "ram_percent": ram_percent,
            "cpu_percent": cpu_percent,
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = state;
        serde_json::json!({
            "ram_used_gb": "0.0",
            "ram_total_gb": "0.0",
            "ram_percent": 0,
            "cpu_percent": 0,
        })
    }
}

#[tauri::command]
fn get_server_tps(id: String, state: State<AppState>) -> Option<f64> {
    state.tps.lock().unwrap().get(&id).copied()
}

#[cfg(target_os = "windows")]
fn get_ram_stats() -> (f64, f64, u32) {
    #[repr(C)]
    struct MemoryStatusEx {
        dw_length: u32,
        dw_memory_load: u32,
        ull_total_phys: u64,
        ull_avail_phys: u64,
        ull_total_page_file: u64,
        ull_avail_page_file: u64,
        ull_total_virtual: u64,
        ull_avail_virtual: u64,
        ull_avail_extended_virtual: u64,
    }
    extern "system" {
        fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
    }
    unsafe {
        let mut mem_status: MemoryStatusEx = std::mem::zeroed();
        mem_status.dw_length = std::mem::size_of::<MemoryStatusEx>() as u32;
        GlobalMemoryStatusEx(&mut mem_status);
        let total_gb = mem_status.ull_total_phys as f64 / 1_073_741_824.0;
        let avail_gb = mem_status.ull_avail_phys as f64 / 1_073_741_824.0;
        let used_gb = total_gb - avail_gb;
        (used_gb, total_gb, mem_status.dw_memory_load)
    }
}

/// Windows GetSystemTimes로 시스템 전체 CPU 사용률 계산
#[cfg(target_os = "windows")]
fn get_cpu_percent(cpu_prev: &Arc<Mutex<Option<(u64, u64)>>>) -> u32 {
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct FileTime {
        dw_low_date_time: u32,
        dw_high_date_time: u32,
    }
    extern "system" {
        fn GetSystemTimes(
            lp_idle_time: *mut FileTime,
            lp_kernel_time: *mut FileTime,
            lp_user_time: *mut FileTime,
        ) -> i32;
    }
    fn ft_to_u64(ft: FileTime) -> u64 {
        ((ft.dw_high_date_time as u64) << 32) | (ft.dw_low_date_time as u64)
    }
    unsafe {
        let mut idle = FileTime { dw_low_date_time: 0, dw_high_date_time: 0 };
        let mut kernel = FileTime { dw_low_date_time: 0, dw_high_date_time: 0 };
        let mut user = FileTime { dw_low_date_time: 0, dw_high_date_time: 0 };
        if GetSystemTimes(&mut idle, &mut kernel, &mut user) == 0 {
            return 0;
        }
        let idle_t = ft_to_u64(idle);
        let total_t = ft_to_u64(kernel) + ft_to_u64(user);

        let mut prev = cpu_prev.lock().unwrap();
        let result = if let Some((prev_idle, prev_total)) = *prev {
            let idle_diff = idle_t.saturating_sub(prev_idle);
            let total_diff = total_t.saturating_sub(prev_total);
            if total_diff == 0 {
                0
            } else {
                let usage = 100.0 * (1.0 - (idle_diff as f64 / total_diff as f64));
                usage.max(0.0).min(100.0).round() as u32
            }
        } else {
            0
        };
        *prev = Some((idle_t, total_t));
        result
    }
}

fn base64_encode(input: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i+1 < input.len() { input[i+1] as u32 } else { 0 };
        let b2 = if i+2 < input.len() { input[i+2] as u32 } else { 0 };
        result.push(CHARS[((b0 >> 2) & 0x3F) as usize] as char);
        result.push(CHARS[(((b0 << 4) | (b1 >> 4)) & 0x3F) as usize] as char);
        result.push(if i+1 < input.len() { CHARS[(((b1 << 2) | (b2 >> 6)) & 0x3F) as usize] as char } else { '=' });
        result.push(if i+2 < input.len() { CHARS[(b2 & 0x3F) as usize] as char } else { '=' });
        i += 3;
    }
    result
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = input.trim_end_matches('=');
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    for c in input.bytes() {
        let val = CHARS.iter().position(|&x| x == c)
            .ok_or_else(|| format!("invalid base64 char: {}", c))? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(result)
}

fn classify_log(line: &str) -> &'static str {
    let l = line.to_lowercase();
    if l.contains("[warn]") || l.contains("warning") { "WARN" }
    else if l.contains("[error]") || l.contains("exception") { "ERROR" }
    else if l.contains("joined the game") || l.contains("left the game") { "JOIN" }
    else { "INFO" }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            servers: Arc::new(Mutex::new(HashMap::new())),
            cpu_prev: Arc::new(Mutex::new(None)),
            tps: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            kill_server,
            send_command,
            is_server_running,
            read_file,
            write_file,
            list_dir,
            read_file_base64,
            write_file_base64,
            delete_file,
            copy_server_icon,
            detect_java,
            run_git,
            git_sync_mods,
            get_system_stats,
            get_server_tps,
            accept_eula,
            download_file,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행 오류");
}
