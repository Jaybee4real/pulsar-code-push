#!/bin/sh
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
vectors="${1:-$here/../../../docs/private-bundles/vectors.json}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
javac -d "$work/classes" \
  "$here/android/stubs/android/util/Base64.java" \
  "$here"/android/stubs/org/json/*.java \
  "$here/../../android/src/main/java/com/microsoft/codepush/react/PulsarBundleDecryptor.java" \
  "$here/android/DecryptorVectors.java"
java -cp "$work/classes" DecryptorVectors "$vectors" "$work"
