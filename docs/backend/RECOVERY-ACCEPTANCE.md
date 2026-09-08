# B-05 acceptance mapping

| Requirement | Executed evidence |
| --- | --- |
| Evidence-bound plan/check/apply under one writer lock | Recovery CLI plan/check/apply and legitimate running-service lock tests; immutable action hash; same original package replay |
| Exact DB/restore/ledger binding | Auth mutation stale-plan test; persisted plan tamper test; old plan rejected after another restore; schema version in hash |
| Two users, multiple currencies, old UTC periods | Recovery core actual/estimated/unknown tests; late August charge remains August; EUR and member B remain separate |
| Actual above quote, no clipping |95/60 HTTP examples and95/110/105-micro core settlements; discrepancy and actual budget admission assertions |
| Missing actual is not zero; nondecreasing bound | Bound90 retained despite closed label; lower bound rejected; terminal actual22 and explicit confirmed zero accepted |
| Lost post-backup data affects real budgets | Both wholly missing operation and retained prepared-job submission restored; actual new HTTP submission denied for money/request/byte |
| No double-count, executable fake, owner substitution or key restoration | Tombstones/replay tests, no fabricated job/artifact, lost credential/version remains metadata, other member own-key HTTP submit |
| Partial coverage holds; full coverage computed | Missing scope, day/total mismatch, unresolved retain, legacy interval and retirement gaps; subsequent complete package without duplicate liability |
| Atomic failure | Faults after evidence/entry/hold, plus SQLite constraint failure after hold deletion; all data/hold/generation roll back |
| Versioned restore/rollback boundary | Actual schema1/2/3 snapshots upgrade to4 without changing originals; future schema refused; held backup preserves earlier coverage floor |
| Private bounded evidence and stdout | Size/field/hash/resource failures, no key-material field accepted; CLI output checks; private report/evidence locations; no live provider calls |
| Existing functionality retained |58 baseline backend/adapter tests retained; schema2 fixture updated for a genuine old schema and new expected version; total80/80 |

Test names, assertions, version, duration and stable file hashes are in the final TAP and test-summary.json. No synthetic statement is labeled provider-verified; invoice truth/cutover/deployment are outside the machine test claim.
