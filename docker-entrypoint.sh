#!/bin/sh
set -e

# Default UID/GID if not specified
PUID=${PUID:-568}
PGID=${PGID:-568}

# Ensure frame group and user match the desired PUID/PGID
if [ "$(id -u frame 2>/dev/null)" != "$PUID" ] || [ "$(id -g frame 2>/dev/null)" != "$PGID" ]; then
    groupmod -o -g "$PGID" frame 2>/dev/null || groupadd -g "$PGID" frame 2>/dev/null || true
    usermod -o -u "$PUID" -g "$PGID" frame 2>/dev/null || useradd -u "$PUID" -g "$PGID" -m -s /bin/sh frame 2>/dev/null || true
fi

# Ensure data and config directories exist and have proper ownership
mkdir -p /app/data /app/config
chown -R "$PUID:$PGID" /app/data /app/config /app/dist 2>/dev/null || true

# Execute command as frame user if running as root
if [ "$(id -u)" = "0" ]; then
    exec su-exec "$PUID:$PGID" "$@"
else
    exec "$@"
fi
