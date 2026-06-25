#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

TEAM_ID="TWFK4FAG36"
BUNDLE_ID="com.turbalance.analyticsApp"
PROJECT="ios/App/App.xcodeproj"
SCHEME="App"
CONFIGURATION="Release"
ARCHIVE_PATH="build/turbalance-testflight.xcarchive"
APP_STORE_EXPORT_PATH="build/export-app-store-connect"
DEVELOPMENT_EXPORT_PATH="build/export-debugging"

usage() {
  cat <<'EOF'
Usage: scripts/package-ios-testflight.sh [check|archive|upload|all|development-ipa]

Commands:
  check            Verify the Xcode target resolves to TWFK4FAG36/com.turbalance.analyticsApp.
  archive          Build a fresh Release .xcarchive for iOS devices.
  upload           Upload the existing archive to App Store Connect for TestFlight.
  all              Run check, archive, then upload. Default.
  development-ipa  Export a development-signed IPA for registered development devices.

Optional App Store Connect API key environment:
  ASC_KEY_PATH or APP_STORE_CONNECT_API_KEY_PATH
  ASC_KEY_ID or APP_STORE_CONNECT_API_KEY_ID
  ASC_ISSUER_ID or APP_STORE_CONNECT_API_ISSUER_ID
EOF
}

build_setting() {
  local key="$1"
  xcodebuild -project "$PROJECT" \
    -scheme "$SCHEME" \
    -showBuildSettings \
    -configuration "$CONFIGURATION" \
    -destination 'generic/platform=iOS' 2>/dev/null \
    | awk -F' = ' -v key="$key" '$1 ~ "^[[:space:]]*" key "$" { value=$2 } END { print value }'
}

check_identity() {
  local resolved_team
  local resolved_bundle

  resolved_team="$(build_setting DEVELOPMENT_TEAM)"
  resolved_bundle="$(build_setting PRODUCT_BUNDLE_IDENTIFIER)"

  if [[ "$resolved_team" != "$TEAM_ID" ]]; then
    echo "Expected DEVELOPMENT_TEAM=$TEAM_ID but got '$resolved_team'." >&2
    exit 1
  fi

  if [[ "$resolved_bundle" != "$BUNDLE_ID" ]]; then
    echo "Expected PRODUCT_BUNDLE_IDENTIFIER=$BUNDLE_ID but got '$resolved_bundle'." >&2
    exit 1
  fi

  echo "Signing identity OK: $TEAM_ID / $BUNDLE_ID"
}

archive_app() {
  check_identity
  rm -rf "$ARCHIVE_PATH"
  xcodebuild -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE_PATH" \
    -allowProvisioningUpdates \
    archive
}

write_export_options() {
  local path="$1"
  local method="$2"
  local destination="$3"
  local strip_swift_symbols="$4"

  cat > "$path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>$destination</string>
  <key>method</key>
  <string>$method</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <$strip_swift_symbols/>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF
}

app_store_connect_auth_args() {
  local key_path="${ASC_KEY_PATH:-${APP_STORE_CONNECT_API_KEY_PATH:-}}"
  local key_id="${ASC_KEY_ID:-${APP_STORE_CONNECT_API_KEY_ID:-}}"
  local issuer_id="${ASC_ISSUER_ID:-${APP_STORE_CONNECT_API_ISSUER_ID:-}}"

  if [[ -n "$key_path$key_id$issuer_id" ]]; then
    if [[ -z "$key_path" || -z "$key_id" || -z "$issuer_id" ]]; then
      echo "Set all API key vars: ASC_KEY_PATH, ASC_KEY_ID, and ASC_ISSUER_ID." >&2
      exit 1
    fi
    printf '%s\n' \
      "-authenticationKeyPath" "$key_path" \
      "-authenticationKeyID" "$key_id" \
      "-authenticationKeyIssuerID" "$issuer_id"
  fi
}

upload_to_testflight() {
  check_identity
  if [[ ! -d "$ARCHIVE_PATH" ]]; then
    echo "Archive not found at $ARCHIVE_PATH. Run: scripts/package-ios-testflight.sh archive" >&2
    exit 1
  fi

  rm -rf "$APP_STORE_EXPORT_PATH"
  mkdir -p "$APP_STORE_EXPORT_PATH"
  local export_options
  export_options="$(mktemp /tmp/turbalance-export-app-store-connect.XXXXXX)"
  write_export_options "$export_options" "app-store-connect" "upload" "true"

  local -a auth_args=()
  while IFS= read -r arg; do
    auth_args+=("$arg")
  done < <(app_store_connect_auth_args)

  local -a export_command=(
    xcodebuild -exportArchive
    -archivePath "$ARCHIVE_PATH"
    -exportPath "$APP_STORE_EXPORT_PATH"
    -exportOptionsPlist "$export_options"
    -allowProvisioningUpdates
    -allowProvisioningDeviceRegistration
  )
  if ((${#auth_args[@]})); then
    export_command+=("${auth_args[@]}")
  fi
  "${export_command[@]}"
}

export_development_ipa() {
  check_identity
  if [[ ! -d "$ARCHIVE_PATH" ]]; then
    echo "Archive not found at $ARCHIVE_PATH. Running archive first."
    archive_app
  fi

  rm -rf "$DEVELOPMENT_EXPORT_PATH"
  mkdir -p "$DEVELOPMENT_EXPORT_PATH"
  local export_options
  export_options="$(mktemp /tmp/turbalance-export-debugging.XXXXXX)"
  write_export_options "$export_options" "debugging" "export" "false"

  xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$DEVELOPMENT_EXPORT_PATH" \
    -exportOptionsPlist "$export_options" \
    -allowProvisioningUpdates
}

command="${1:-all}"
case "$command" in
  check)
    check_identity
    ;;
  archive)
    archive_app
    ;;
  upload)
    upload_to_testflight
    ;;
  all)
    archive_app
    upload_to_testflight
    ;;
  development-ipa)
    export_development_ipa
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
