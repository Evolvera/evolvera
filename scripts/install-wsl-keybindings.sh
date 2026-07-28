#!/bin/bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "usage: $0 <source-json> <destination-json>" >&2
    exit 2
fi

source_json=$1
destination_json=$2

is_wsl=false
[ -n "${WSL_DISTRO_NAME:-}" ] && is_wsl=true
[ -n "${WSL_INTEROP:-}" ] && is_wsl=true
if [ -r /proc/sys/kernel/osrelease ] && grep -Eiq 'microsoft|wsl' /proc/sys/kernel/osrelease; then
    is_wsl=true
fi

if [ "$is_wsl" != true ]; then
    printf 'skipped\n'
    exit 0
fi

if [ ! -f "$source_json" ] || [ ! -d "$(dirname "$destination_json")" ]; then
    echo "invalid source or destination" >&2
    exit 2
fi

if [ -e "$destination_json" ] || [ -L "$destination_json" ]; then
    printf 'preserved\n'
    exit 0
fi

cp "$source_json" "$destination_json"
printf 'installed\n'
