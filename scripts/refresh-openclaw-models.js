#!/usr/bin/env node
/** Delegates to global ~/.copilot/scripts/refresh-openclaw-models.js
 *  Global source of truth — do not duplicate logic here.
 *  npm run models:refresh  →  refresh-openclaw-models [profile] [top-n] */
require(require('path').join(require('os').homedir(), '.copilot/scripts/refresh-openclaw-models.js'));
