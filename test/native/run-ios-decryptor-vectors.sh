#!/bin/sh
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
vectors="${1:-$here/../../../docs/private-bundles/vectors.json}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
clang -fobjc-arc -O2 -framework Foundation -I "$here/../../ios/CodePush" \
  "$here/../../ios/CodePush/PulsarBundleDecryptor.m" "$here/ios/main.m" -o "$work/decryptor-vectors"
"$work/decryptor-vectors" "$vectors" "$work"
