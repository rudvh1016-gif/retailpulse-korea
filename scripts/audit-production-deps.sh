#!/usr/bin/env bash
# Fails CI on a high or critical vulnerability in production dependencies.
#
# `npm audit --audit-level=high` alone cannot tell two very different things
# apart, because it exits non-zero for both: "your dependencies are
# vulnerable", and "the registry did not answer". On 2026-09-04 the audit
# endpoint returned 503 for over half an hour and blocked every pull request
# in the repository, including runs on `main` carrying no changes at all — and
# each attempt hung for six minutes before failing.
#
# An unreachable registry is not evidence of a vulnerability, and it is also
# not evidence of safety. So this bounds each attempt, retries, and if the
# endpoint is still down says loudly that the audit did not run rather than
# either failing the build or quietly implying the dependencies were checked.
#
# The vulnerability gate itself is unchanged and stricter in one respect: the
# counts are read from the report instead of inferred from an exit code.
set -uo pipefail

ATTEMPTS=3
PER_ATTEMPT_SECONDS=90
report="$(mktemp)"
trap 'rm -f "$report"' EXIT

for attempt in $(seq 1 "$ATTEMPTS"); do
  # `npm audit` exits non-zero when it finds vulnerabilities, so the exit code
  # is ignored here; whether the JSON report parses is what separates a real
  # answer from an outage.
  timeout "$PER_ATTEMPT_SECONDS" npm audit --omit=dev --json >"$report" 2>/dev/null

  if summary=$(node -e '
      const parsed = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const v = parsed?.metadata?.vulnerabilities;
      if (!v) process.exit(2);
      console.log(JSON.stringify({ blocking: (v.high || 0) + (v.critical || 0), counts: v }));
    ' "$report" 2>/dev/null); then
    blocking=$(node -pe 'JSON.parse(process.argv[1]).blocking' "$summary")
    echo "npm audit (production dependencies): $(node -pe 'JSON.stringify(JSON.parse(process.argv[1]).counts)' "$summary")"
    if [ "$blocking" -gt 0 ]; then
      echo "::error::$blocking high or critical vulnerabilities in production dependencies"
      exit 1
    fi
    echo "No high or critical vulnerabilities in production dependencies."
    exit 0
  fi

  echo "npm audit returned no usable report (attempt $attempt/$ATTEMPTS)."
  [ "$attempt" -lt "$ATTEMPTS" ] && sleep $((attempt * 15))
done

# Reached only when the registry never answered. Loud, and explicitly NOT a
# statement that the dependencies are clean.
echo "::warning::npm audit could not reach the registry after $ATTEMPTS attempts; production dependencies were NOT audited in this run."
exit 0
