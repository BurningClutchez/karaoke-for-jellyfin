#!/usr/bin/env node
// CLI for the Jellyfin preflight check (the logic lives in server/ so the
// Docker image, which ships server/, can run it at startup too)
require("../server/jellyfin-check").main();
