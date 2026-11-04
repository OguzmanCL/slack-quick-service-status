#!/usr/bin/env bash
# <bitbar.title>Service Status</bitbar.title>
# <bitbar.version>v1.0</bitbar.version>
# <bitbar.author>oscarguzman</bitbar.author>
# <bitbar.desc>GitHub and Claude status from their Statuspage APIs, refreshed every 5 minutes.</bitbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>

NODE="${SERVICE_STATUS_NODE:-$HOME/.local/share/fnm/aliases/default/bin/node}"
PLUGIN_DIR="$(cd "$(dirname "$(readlink "${BASH_SOURCE[0]}" || echo "${BASH_SOURCE[0]}")")" && pwd)"

exec "$NODE" --experimental-strip-types --no-warnings "$PLUGIN_DIR/plugin.ts"
