/**
 * Kotlin-style String extensions Mangayomi's JS runtime installs
 * (lib/eval/javascript/js_common.dart), reproduced for the test harness.
 *
 * Sources in this repo should not depend on them — the shared utilities do
 * the same work explicitly — but third-party snippets and quick experiments
 * sometimes do, and a mismatch here would hide a real bug.
 */
"use strict";

function install(proto) {
  if (proto.__mangayomiHelpersInstalled) return;
  proto.__mangayomiHelpersInstalled = true;

  proto.substringAfter = function (pattern) {
    const index = this.indexOf(pattern);
    if (index === -1) return this.substring(0);
    return this.substring(index + pattern.length);
  };

  proto.substringAfterLast = function (pattern) {
    return this.split(pattern).pop();
  };

  proto.substringBefore = function (pattern) {
    const index = this.indexOf(pattern);
    if (index === -1) return this.substring(0);
    return this.substring(0, index);
  };

  proto.substringBeforeLast = function (pattern) {
    const index = this.lastIndexOf(pattern);
    if (index === -1) return this.substring(0);
    return this.substring(0, index);
  };

  proto.substringBetween = function (left, right) {
    const index = this.indexOf(left);
    if (index === -1) return "";
    const leftIndex = index + left.length;
    const rightIndex = this.indexOf(right, leftIndex);
    if (rightIndex === -1) return "";
    return this.substring(leftIndex, rightIndex);
  };
}

module.exports = { install };
