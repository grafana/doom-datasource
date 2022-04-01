#!/usr/bin/env bash

# Installs and provisions the Alerting UI on Hosted Grafana instances by setting
# grafana.com/api/instances/<instance>/config[hosted_grafana][custom_command]
# to a bash fragment that
#
# 1. calls grafana-cli plugins install
# 2. provisions the plugin by writing .../provisioning/plugins/alerting-ui.yaml

set -euo pipefail

usage() {
	cat <<EOF
deploy-to-hg-instance <cmd> <instance>
  Manage custom install of grafana-alerting-ui-app in Hosted Grafana
  instances via grafana.com instance config's custom_command.
Environment:
  GCOM_TOKEN:                   A staff grafana.com API token
	GCS_BASE:                     Path to where the zip file is located
  VERSION or ./version:         Plugin version (e.g. dev-master-cd22922)
Commands:
  install         Install Alerting UI to the given instances
  status          Check whether the given instances are managed by this script
  reset           Reset the given instances' custom_command setting (doesn't
                  uninstall or deconfigure the plugin)
Auxiliary commands:
  print_commands  Print commands that would be written by \`install\`
  fetch_commands  List current commands for the given instances
EOF
exit 1
}

fail() {
	echo error: "$@" 1>&2
	exit 1
}

ensure_token() {
	if [ -z "${GCOM_TOKEN:-}" ]; then
		fail "need an API key in \$GCOM_TOKEN"
	fi
}

ensure_version() {
	if [ -z "${VERSION:-}" ]; then
		if [ -f version ]; then
			VERSION=$(cat version)
		else
			fail "need a plugin version in \$VERSION or ./version"
		fi
	fi
}

ensure_gcs_base() {
	if [ -z "${GCS_BASE:-}" ]; then
		fail "need a path to plugin in \$GCS_BASE"
	fi
}

ensure_tools() {
	hash curl 2>/dev/null || fail "curl not found"
	hash jq 2>/dev/null || fail "jq not found"
}

gcom() {
	url="https://grafana.com/api${1}"
	shift
	ret=$(curl -s -H "Authorization: Bearer ${GCOM_TOKEN}" "$url" "$@")
	if [ "$ret" = "true" ]; then
		echo true
		return
	fi
	if echo "$ret" | jq -e .code > /dev/null; then
		code=$(echo "$ret" | jq -r .code)
		msg=$(echo "$ret" | jq -r .message)
		fail "${code}: ${msg}"
	else
		echo "$ret"
	fi
}

get_instance_commands() {
	gcom "/instances/$1/config" | jq -r .hosted_grafana.custom_commands
}

set_instance_commands() {
	# redirect to avoid echoing secrets
	gcom "/instances/$1/config" -d "config[hosted_grafana][custom_commands]=$2" >/dev/null
}

instance_status() {
	commands=$(get_instance_commands "$1")
	if [ -z "$commands" ]; then
		echo unconfigured
		return
	fi
	if [ "$commands" = "null" ]; then
		echo unconfigured
		return
	fi
	match="^\# grafana-doom-datasource managed plugin install"
	if [[ "${commands}" =~ $match ]]; then
		version=$(echo "${commands}" | grep '^# VERSION=' | cut -d= -f2)
		echo managed "$version"
		return
	fi
	echo unmanaged
}

custom_commands() {
	base_url="https://storage.googleapis.com/${GCS_BASE}"
	plugin_id=grafana-doom-datasource

	cat <<-EOF
		# grafana-doom-datasource managed plugin install
		# VERSION=${VERSION}
		grafana-cli --pluginUrl=${base_url}${plugin_id}-${VERSION}.zip plugins install ${plugin_id}
		mkdir -p /usr/share/grafana/conf/provisioning/plugins
		cat >/usr/share/grafana/conf/provisioning/plugins/doom-datasource.yaml <<YAMLEOF
		apiVersion: 1
		apps:
		  - type: ${plugin_id}
		YAMLEOF
	EOF
}

instance_install() {
	status=$(instance_status "$1")
	if [ "$status" = unmanaged ]; then
		fail "incompatible custom commands"
	fi
	set_instance_commands "$1" "$(custom_commands)"
	echo installed
}

instance_reset() {
	set_instance_commands "$1" ""
	echo reset
}

command="${1:-}"
if [ "$command" = help ]; then
	usage
fi

ensure_tools
ensure_token
ensure_gcs_base

instance="${2:-}"
if [ -z "$instance" ]; then
	usage
fi

case "$command" in
status)
	instance_status "$instance"
	;;
install)
	ensure_version
	instance_install "$instance"
	;;
reset)
	instance_reset "$instance"
	;;
print_commands)
	ensure_version
	custom_commands
	;;
fetch_commands)
	get_instance_commands "$instance"
	;;
*)
	usage
	;;
esac
