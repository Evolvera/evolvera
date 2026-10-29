#!/bin/bash
set -eu
PI_DIR="${1:?usage: install-app.sh PI_AGENT_DIR HOME [darwin|linux]}"
USER_HOME="${2:?usage: install-app.sh PI_AGENT_DIR HOME [darwin|linux]}"
TARGET_OS="${3:-${PI_STUDIO_TEST_OS:-$(uname -s | tr '[:upper:]' '[:lower:]')}}"
APP="$USER_HOME/Applications/PI Studio.app"
mkdir -p "$PI_DIR/bin"
cat >"$PI_DIR/bin/pi-studio" <<EOF
#!/bin/bash
exec node "$PI_DIR/studio/cli.mjs" "\$@"
EOF
chmod +x "$PI_DIR/bin/pi-studio"
case "$TARGET_OS" in
  darwin)
    chmod +x "$PI_DIR/studio/desktop/launch-macos.sh"
    mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
    cat >"$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>PI Studio</string>
<key>CFBundleIdentifier</key><string>com.evolvera.pistudio</string>
<key>CFBundleExecutable</key><string>PI Studio</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
    cat >"$APP/Contents/MacOS/PI Studio" <<EOF
#!/bin/bash
exec "$PI_DIR/studio/desktop/launch-macos.sh" "\$@"
EOF
    chmod +x "$APP/Contents/MacOS/PI Studio"
    echo "PI Studio instalado: $APP"
    ;;
  linux)
    mkdir -p "$USER_HOME/.local/share/applications"
    cat >"$USER_HOME/.local/share/applications/pi-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=PI Studio
Exec="$PI_DIR/studio/desktop/launch-unix.sh"
Terminal=false
Categories=Development;
EOF
    chmod +x "$PI_DIR/studio/desktop/launch-unix.sh"
    echo "PI Studio instalado: $USER_HOME/.local/share/applications/pi-studio.desktop"
    ;;
  *) echo "Sistema operacional não suportado: $TARGET_OS" >&2; exit 2 ;;
esac
