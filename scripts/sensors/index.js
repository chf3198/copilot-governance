'use strict';
// Sensor aggregator (#1257) — composes 6 pure-function sensors per Phase-0 R&D §2 (#1247).
// Per Epic #1113 AC3.

const ga = require('./ga');
const ll = require('./ll');
const cf = require('./cf');
const pr = require('./pr');
const rp = require('./rp');
const oo = require('./oo');

function aggregate({ violationCount, runs, closeouts, reviews, reopens, flag } = {}) {
  return {
    ga: ga.compute({ violationCount }).value,
    ll: ll.compute({ runs }).value,
    cf: cf.compute({ closeouts }).value,
    pr: pr.compute({ reviews }).value,
    rp: rp.compute({ reopens }).value,
    oo: oo.compute({ flag }).value,
  };
}

module.exports = { ga, ll, cf, pr, rp, oo, aggregate };
