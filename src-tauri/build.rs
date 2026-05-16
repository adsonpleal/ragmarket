use std::env;
use std::path::PathBuf;

fn main() {
    // Tell rustc where to find WinDivert.lib (bundled in resources/x64/).
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let lib_dir = manifest_dir.join("resources").join("x64");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=dylib=WinDivert");
    println!(
        "cargo:rerun-if-changed={}",
        lib_dir.join("WinDivert.lib").display()
    );

    // Force the app to always run as Administrator. WinDivert needs admin
    // to open its kernel driver service; without this Windows would let the
    // .exe start unprivileged and the capture call would fail with EACCES.
    // The manifest goes into the .exe itself, so it applies to every launch
    // (Start Menu shortcut, direct double-click, etc.) without the user
    // touching the file's Properties dialog.
    //
    // The Common-Controls v6 dependency is required: Tauri's WebView2 host
    // calls TaskDialogIndirect, which only exists in comctl32 v6. Without
    // this assemblyIdentity, Windows loads legacy comctl32 v5 and the .exe
    // crashes on launch with "Entry Point Not Found: TaskDialogIndirect".
    let admin_manifest = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>"#;

    let windows_attrs = tauri_build::WindowsAttributes::new().app_manifest(admin_manifest);
    let attrs = tauri_build::Attributes::new().windows_attributes(windows_attrs);
    tauri_build::try_build(attrs).expect("tauri build script failed");
}
