#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="ScreenTranslate"
PROJECT_PATH="$SCRIPT_DIR/${APP_NAME}.xcodeproj"
DERIVED_DATA_PATH="$SCRIPT_DIR/.derived-data"

"$SCRIPT_DIR/stop-menubar.sh" >/dev/null 2>&1 || true

if ! command -v tuist >/dev/null 2>&1; then
  if [[ ! -d "$PROJECT_PATH" ]]; then
    echo "Tuist is required to generate $APP_NAME.xcodeproj before the app can run."
    echo "Install Tuist, then rerun this script."
    exit 1
  fi
else
  (
    cd "$SCRIPT_DIR"
    tuist generate --no-open
  )
fi

xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$APP_NAME" \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  build

open "$DERIVED_DATA_PATH/Build/Products/Debug/$APP_NAME.app"
