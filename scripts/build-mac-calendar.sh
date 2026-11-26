app=build/mac/AlongsideCalendar.app
exe="$app/Contents/MacOS/AlongsideCalendar"
if [[ ! -x "$exe" || mac/calendar.m -nt "$exe" || mac/Info.plist -nt "$exe" ]]; then
  mkdir -p "$app/Contents/MacOS"
  cp mac/Info.plist "$app/Contents/Info.plist"
  sdk="$(xcrun --show-sdk-path)"
  if [[ -d /Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk ]]; then sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk; fi
  xcrun clang -isysroot "$sdk" -fobjc-arc -framework AppKit -framework EventKit mac/calendar.m -o "$exe"
  codesign --force --sign - "$app"
fi
