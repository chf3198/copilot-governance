#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseActiveProfile, readSchema } = require('./authorization-profile');

const DEFAULT_SCHEMA_PATH = path.join(__dirname, '..', '..', 'config', 'authorization-profiles.json');

function formatCapabilities(caps) {
  const lines = Object.entries(caps).map(([k, v]) => `  - ${k}: ${v ? '✅' : '❌'}`);
  return lines.join('\n');
}

function buildPromptInjection(profile) {
  return `\n# Authorization Profile Context

**Active Authorization Profile**: \`${profile.profile}\`

Your execution authority is scoped by the active authorization profile. You cannot escalate capabilities beyond the profile constraints without explicit ticket/approval.

### Capabilities
${formatCapabilities(profile.capabilities)}

### Profile Details
- Source: ${profile.source} (precedence: ${profile.precedence.join(' > ')})
- Schema: ${path.basename(DEFAULT_SCHEMA_PATH)}

### How to Override
- CLI: \`--profile=<owner|guarded|restricted>\`
- Environment: \`MEGINGJORD_AUTH_PROFILE=<value>\`
- Restart required for activation

### Privilege Gates
Operations requiring elevated capability will be rejected if your profile restricts them:
\`\`\`
install        requires profile.capabilities.install === true
upgrade        requires profile.capabilities.upgrade === true
privileged     requires profile.capabilities.privileged === true
execute_remote requires profile.capabilities.execute_remote === true
\`\`\`
`;
}

function buildMetadata(profile) {
  return {
    profile: profile.profile,
    capabilities: profile.capabilities,
    source: profile.source,
    precedence: profile.precedence,
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
  };
}

function main() {
  const args = process.argv.slice(2);
  const format = args.includes('--json') ? 'json' : 'text';
  const asPromptFlag = args.includes('--prompt');
  const asMetadataFlag = args.includes('--metadata');

  try {
    const schema = readSchema();
    const profile = parseActiveProfile({ schema });

    if (format === 'json') {
      const out = asPromptFlag ? { prompt_injection: buildPromptInjection(profile) }
        : asMetadataFlag ? { session_metadata: buildMetadata(profile) }
        : { profile, schema };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    } else {
      if (asPromptFlag) {
        process.stdout.write(buildPromptInjection(profile));
      } else if (asMetadataFlag) {
        process.stdout.write(JSON.stringify(buildMetadata(profile), null, 2) + '\n');
      } else {
        process.stdout.write(`Profile: ${profile.profile}\nSource: ${profile.source}\n`);
        process.stdout.write(`Capabilities:\n${formatCapabilities(profile.capabilities)}\n`);
      }
    }
  } catch (e) {
    process.stderr.write(`authorization-profile-context: ${e.message}\n`);
    process.exit(2);
  }
}

module.exports = { formatCapabilities, buildPromptInjection, buildMetadata };
if (require.main === module) main();
