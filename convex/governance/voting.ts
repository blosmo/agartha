import type { Doc } from "../_generated/dataModel";
import type {
  GovernanceChoice,
  GovernanceTally,
} from "../../packages/protocol/src/governance";
import { fail } from "../scene/model";
export function policyV1(voterCount: number) {
  return {
    version: 1 as const,
    quorum: Math.ceil(voterCount / 2),
    approval: "majority" as const,
  };
}
/** Version 1 is a historical decision rule: add new versions rather than changing it. */
export function tallyV1(
  p: Doc<"governanceProposals">,
  ballots: readonly { agentId: string; choice: GovernanceChoice }[],
): GovernanceTally {
  const policy = p.votingPolicy ?? policyV1(p.eligibleVoters.length);
  if (
    policy.version !== 1 ||
    policy.approval !== "majority" ||
    !Number.isSafeInteger(policy.quorum) ||
    policy.quorum < 0 ||
    policy.quorum > 64
  )
    fail("invalid", "Unsupported voting policy.");
  const voters = new Set(p.eligibleVoters.map((v) => v.agentId)),
    cast = new Set<string>();
  const tally: GovernanceTally = {
    yes: 0,
    no: 0,
    abstain: 0,
    total: 0,
    quorum: policy.quorum,
    voterCount: voters.size,
    passed: false,
  };
  for (const ballot of ballots) {
    if (
      !voters.has(ballot.agentId) ||
      cast.has(ballot.agentId) ||
      !["yes", "no", "abstain"].includes(ballot.choice)
    )
      fail("invalid", "Invalid historical ballot.");
    cast.add(ballot.agentId);
    tally[ballot.choice]++;
    tally.total++;
  }
  tally.passed = tally.total >= policy.quorum && tally.yes > tally.no;
  return tally;
}
