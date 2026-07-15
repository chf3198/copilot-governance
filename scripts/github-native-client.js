// tier: 2
// github-native-client.js — unified Layer-2 client wrapper (Epic #2488 Phase-1 AC7). Refs #2756.
// MEGINGJORD_HAMR_ENABLED=1 → HAMR routes; default (0/unset) → GitHub-native.
// RPC routes (mcp-dispatch interactive, review-run) stay HAMR-default per Phase-0 carve-out.
'use strict';
const hamrEnabled = () => process.env.MEGINGJORD_HAMR_ENABLED === '1';

let hamrClient;
function loadHamr() {
  if (!hamrClient) hamrClient = require('./hamr-provider-wrapper');
  return hamrClient;
}

let mailbox, bundle, mcpDispatch, telemetry, substrateHealth;
function loadGithubNative() {
  if (!mailbox) mailbox = require('./github-mailbox');
  if (!bundle) bundle = require('./github-bundle-client');
  if (!mcpDispatch) mcpDispatch = require('./github-mcp-dispatch');
  if (!telemetry) telemetry = require('./github-telemetry-read');
  if (!substrateHealth) substrateHealth = require('./github-substrate-health-read');
}

async function writeMailbox(owner, repo, body) {
  if (hamrEnabled()) return loadHamr().writeMailbox?.(owner, repo, body);
  loadGithubNative();
  return mailbox.writeMessage(owner, repo, body);
}

async function readMailbox(owner, repo, since) {
  if (hamrEnabled()) return loadHamr().readMailbox?.(owner, repo, since) ?? [];
  loadGithubNative();
  return mailbox.readMessages(owner, repo, since);
}

async function publishBundle(owner, repo, name, payload) {
  if (hamrEnabled()) return loadHamr().publishBundle?.(owner, repo, name, payload);
  loadGithubNative();
  return bundle.publishBundle(owner, repo, name, payload);
}

async function fetchBundle(owner, repo, name) {
  if (hamrEnabled()) return loadHamr().fetchBundle?.(owner, repo, name) ?? null;
  loadGithubNative();
  return bundle.fetchBundle(owner, repo, name);
}

// RPC routes stay HAMR-default (Phase-0 carve-out: async only via GH for non-interactive)
async function dispatchMcp(owner, repo, eventType, payload) {
  loadGithubNative();
  return mcpDispatch.dispatch(owner, repo, eventType, payload);
}

async function readTelemetry(repo) {
  if (hamrEnabled()) return loadHamr().readTelemetry?.(repo) ?? null;
  loadGithubNative();
  return telemetry.readTelemetry(repo);
}

async function readSubstrateHealth(repo) {
  if (hamrEnabled()) return loadHamr().readSubstrateHealth?.(repo) ?? null;
  loadGithubNative();
  return substrateHealth.readSubstrateHealth(repo);
}

module.exports = {
  writeMailbox, readMailbox,
  publishBundle, fetchBundle,
  dispatchMcp,
  readTelemetry, readSubstrateHealth,
};
