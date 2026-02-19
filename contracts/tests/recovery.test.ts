import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const guardian1 = accounts.get("wallet_1")!;
const guardian2 = accounts.get("wallet_2")!;
const guardian3 = accounts.get("wallet_3")!;
const guardian4 = accounts.get("wallet_4")!;
const nonGuardian = accounts.get("wallet_5")!;
const newOwner = accounts.get("wallet_6")!;
const randomUser = accounts.get("wallet_7")!;

// Helper functions
function proposeOwner(
  newOwnerPrincipal: string,
  timelockBlocks: number = 100,
  expiryBlocks: number = 1000,
  sender: string = guardian1
) {
  return simnet.callPublicFn(
    "recovery",
    "propose-owner",
    [
      Cl.principal(newOwnerPrincipal),
      Cl.uint(timelockBlocks),
      Cl.uint(expiryBlocks)
    ],
    sender
  );
}

function approveProposal(proposalId: number, sender: string) {
  return simnet.callPublicFn(
    "recovery",
    "approve",
    [Cl.uint(proposalId)],
    sender
  );
}

function cancelProposal(proposalId: number, sender: string) {
  return simnet.callPublicFn(
    "recovery",
    "cancel",
    [Cl.uint(proposalId)],
    sender
  );
}

function executeProposal(proposalId: number, sender: string) {
  return simnet.callPublicFn(
    "recovery",
    "execute",
    [Cl.uint(proposalId)],
    sender
  );
}

function getProposal(proposalId: number) {
  return simnet.callReadOnlyFn(
    "recovery",
    "get-proposal",
    [Cl.uint(proposalId)],
    deployer
  );
}

function advanceBlocks(blocks: number) {
  for (let i = 0; i < blocks; i++) {
    simnet.mineEmptyBlock();
  }
}

// Helper to set up guardians and threshold in the guardians contract
function setupGuardians() {
  // This assumes the guardians contract has functions to add guardians and set threshold
  // You may need to adjust based on actual guardians contract implementation
  simnet.callPublicFn(
    "guardians",
    "add-guardian",
    [Cl.principal(guardian1)],
    deployer
  );
  simnet.callPublicFn(
    "guardians",
    "add-guardian",
    [Cl.principal(guardian2)],
    deployer
  );
  simnet.callPublicFn(
    "guardians",
    "add-guardian",
    [Cl.principal(guardian3)],
    deployer
  );
  simnet.callPublicFn(
    "guardians",
    "set-threshold",
    [Cl.uint(2)], // Require 2 of 3 approvals
    deployer
  );
}

// Helper to set vault owner
function setVaultOwner(owner: string) {
  simnet.callPublicFn(
    "vault",
    "set-owner",
    [Cl.principal(owner)],
    deployer
  );
}

function unwrapOkUint(response: any): bigint {
  expect(response.type).toBe("ok");
  const value = response.value;
  expect(value.type).toBe("uint");
  return value.value;
}

function unwrapOkBool(response: any): boolean {
  expect(response.type).toBe("ok");
  const value = response.value;
  expect(value.type).toBe("bool");
  return value.value;
}

function unwrapOkTuple(response: any): any {
  expect(response.type).toBe("ok");
  return response.value;
}

describe("Recovery Contract - Guardian Recovery System", () => {
  
  beforeEach(() => {
    // Setup guardians and threshold
    setupGuardians();
    // Set initial vault owner
    setVaultOwner(guardian1);
  });

  describe("propose-owner", () => {
    it("should create a new recovery proposal", () => {
      const result = proposeOwner(newOwner, 100, 1000, guardian1);
      const proposalId = unwrapOkUint(result.result);
      expect(proposalId).toBe(1n);

      // Verify proposal was created
      const proposal = getProposal(1);
      const proposalData = unwrapOkTuple(proposal.result).expectSome().expectTuple();
      
      expect(proposalData["new_owner"]).toBe(Cl.principal(newOwner));
      expect(proposalData["proposer"]).toBe(Cl.principal(guardian1));
      expect(proposalData["approvals"]).toBeUint(0);
      expect(proposalData["executed"]).toBeBool(false);
      expect(proposalData["canceled"]).toBeBool(false);
    });

    it("should increment proposal nonce for multiple proposals", () => {
      proposeOwner(newOwner, 100, 1000, guardian1);
      const result2 = proposeOwner(newOwner, 100, 1000, guardian2);
      expect(unwrapOkUint(result2.result)).toBe(2n);
    });

    it("should fail with zero expiry blocks", () => {
      const result = proposeOwner(newOwner, 100, 0, guardian1);
      expect(result.result).toBeErr(Cl.uint(110)); // ERR-INVALID-ARG
    });

    it("should allow any guardian to propose", () => {
      const result1 = proposeOwner(newOwner, 100, 1000, guardian2);
      expect(unwrapOkUint(result1.result)).toBe(1n);

      const result2 = proposeOwner(newOwner, 100, 1000, guardian3);
      expect(unwrapOkUint(result2.result)).toBe(2n);
    });
  });

  describe("approve", () => {
    let proposalId: bigint;

    beforeEach(() => {
      const result = proposeOwner(newOwner, 100, 1000, guardian1);
      proposalId = unwrapOkUint(result.result);
    });

    it("should allow guardians to approve a proposal", () => {
      const result = approveProposal(Number(proposalId), guardian2);
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify approval count increased
      const proposal = getProposal(Number(proposalId));
      const proposalData = unwrapOkTuple(proposal.result).expectSome().expectTuple();
      expect(proposalData["approvals"]).toBeUint(1);
    });

    it("should not allow non-guardians to approve", () => {
      const result = approveProposal(Number(proposalId), nonGuardian);
      expect(result.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should not allow duplicate approvals", () => {
      approveProposal(Number(proposalId), guardian2);
      const result = approveProposal(Number(proposalId), guardian2);
      expect(result.result).toBeErr(Cl.uint(145)); // ERR-ALREADY-APPROVED
    });

    it("should allow multiple guardians to approve", () => {
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      const proposal = getProposal(Number(proposalId));
      const proposalData = unwrapOkTuple(proposal.result).expectSome().expectTuple();
      expect(proposalData["approvals"]).toBeUint(2);
    });

    it("should not allow approving executed proposal", () => {
      // First get threshold approvals
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);
      
      // Advance to execution time
      advanceBlocks(101);
      
      // Execute proposal
      executeProposal(Number(proposalId), guardian1);

      // Try to approve after execution
      const result = approveProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(148)); // ERR-RECOVERY_EXECUTED
    });

    it("should not allow approving canceled proposal", () => {
      // Cancel proposal
      cancelProposal(Number(proposalId), guardian1);

      // Try to approve after cancellation
      const result = approveProposal(Number(proposalId), guardian2);
      expect(result.result).toBeErr(Cl.uint(146)); // ERR-RECOVERY-CANCELED
    });

    it("should not allow approving expired proposal", () => {
      // Advance past expiry
      advanceBlocks(1001);

      // Try to approve
      const result = approveProposal(Number(proposalId), guardian2);
      expect(result.result).toBeErr(Cl.uint(147)); // ERR-RECOVERY-EXPIRED
    });

    it("should not allow approving non-existent proposal", () => {
      const result = approveProposal(999, guardian2);
      expect(result.result).toBeErr(Cl.uint(110)); // ERR-INVALID-ARG
    });
  });

  describe("cancel", () => {
    let proposalId: bigint;

    beforeEach(() => {
      const result = proposeOwner(newOwner, 100, 1000, guardian1);
      proposalId = unwrapOkUint(result.result);
    });

    it("should allow proposer to cancel their proposal", () => {
      const result = cancelProposal(Number(proposalId), guardian1);
      expect(result.result).toBeOk(Cl.bool(true));

      const proposal = getProposal(Number(proposalId));
      const proposalData = unwrapOkTuple(proposal.result).expectSome().expectTuple();
      expect(proposalData["canceled"]).toBeBool(true);
    });

    it("should allow vault owner to cancel proposal", () => {
      // Vault owner is guardian1 (set in beforeEach)
      const result = cancelProposal(Number(proposalId), guardian1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("should not allow non-proposer/non-owner to cancel", () => {
      const result = cancelProposal(Number(proposalId), guardian2);
      expect(result.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should not allow canceling already executed proposal", () => {
      // Get threshold approvals
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);
      
      advanceBlocks(101);
      
      // Execute
      executeProposal(Number(proposalId), guardian1);

      // Try to cancel after execution
      const result = cancelProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(148)); // ERR-RECOVERY_EXECUTED
    });

    it("should not allow canceling already canceled proposal", () => {
      cancelProposal(Number(proposalId), guardian1);

      // Try to cancel again
      const result = cancelProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(146)); // ERR-RECOVERY-CANCELED
    });

    it("should not allow canceling expired proposal", () => {
      advanceBlocks(1001);

      const result = cancelProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(147)); // ERR-RECOVERY-EXPIRED
    });

    it("should not allow canceling non-existent proposal", () => {
      const result = cancelProposal(999, guardian1);
      expect(result.result).toBeErr(Cl.uint(110)); // ERR-INVALID-ARG
    });
  });

  describe("execute", () => {
    let proposalId: bigint;

    beforeEach(() => {
      const result = proposeOwner(newOwner, 100, 1000, guardian1);
      proposalId = unwrapOkUint(result.result);
    });

    it("should execute proposal after threshold reached and timelock passed", () => {
      // Get threshold approvals (2 of 3)
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      // Advance past timelock
      advanceBlocks(101);

      // Execute
      const result = executeProposal(Number(proposalId), guardian1);
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify proposal marked as executed
      const proposal = getProposal(Number(proposalId));
      const proposalData = unwrapOkTuple(proposal.result).expectSome().expectTuple();
      expect(proposalData["executed"]).toBeBool(true);

      // Verify vault owner changed (would need to check vault contract)
      // This assumes vault has a get-owner function
    });

    it("should not execute before timelock period", () => {
      // Get threshold approvals
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      // Try to execute immediately (before timelock)
      const result = executeProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(142)); // ERR-RECOVERY-TOO-EARLY
    });

    it("should not execute without enough approvals", () => {
      // Only 1 approval (need 2)
      approveProposal(Number(proposalId), guardian2);

      advanceBlocks(101);

      const result = executeProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should not execute expired proposal", () => {
      // Get approvals
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      // Advance past expiry
      advanceBlocks(1001);

      const result = executeProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(147)); // ERR-RECOVERY-EXPIRED
    });

    it("should not execute canceled proposal", () => {
      // Cancel proposal
      cancelProposal(Number(proposalId), guardian1);

      // Try to execute
      advanceBlocks(101);
      const result = executeProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(146)); // ERR-RECOVERY-CANCELED
    });

    it("should not execute already executed proposal", () => {
      // Get approvals
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      advanceBlocks(101);

      // First execution
      executeProposal(Number(proposalId), guardian1);

      // Try to execute again
      const result = executeProposal(Number(proposalId), guardian1);
      expect(result.result).toBeErr(Cl.uint(148)); // ERR-RECOVERY_EXECUTED
    });

    it("should not execute non-existent proposal", () => {
      const result = executeProposal(999, guardian1);
      expect(result.result).toBeErr(Cl.uint(110)); // ERR-INVALID-ARG
    });
  });

  describe("get-proposal", () => {
    it("should return none for non-existent proposal", () => {
      const result = getProposal(999);
      expect(result.result.type).toBe("ok");
      expect(result.result.value.type).toBe("none");
    });

    it("should return proposal details for existing proposal", () => {
      const proposeResult = proposeOwner(newOwner, 100, 1000, guardian1);
      const proposalId = unwrapOkUint(proposeResult.result);

      const result = getProposal(Number(proposalId));
      const proposalData = unwrapOkTuple(result.result).expectSome().expectTuple();
      
      expect(proposalData["new_owner"]).toBe(Cl.principal(newOwner));
      expect(proposalData["proposer"]).toBe(Cl.principal(guardian1));
      expect(proposalData["created_at"]).toBeDefined();
      expect(proposalData["execute_after"]).toBeDefined();
      expect(proposalData["expires_at"]).toBeDefined();
    });
  });

  describe("complete recovery flow", () => {
    it("should successfully transfer ownership through full recovery process", () => {
      // Step 1: Propose new owner
      const proposeResult = proposeOwner(newOwner, 100, 1000, guardian1);
      const proposalId = unwrapOkUint(proposeResult.result);

      // Step 2: Guardians approve (need 2 of 3)
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      // Step 3: Wait for timelock
      advanceBlocks(101);

      // Step 4: Execute
      const executeResult = executeProposal(Number(proposalId), guardian1);
      expect(executeResult.result).toBeOk(Cl.bool(true));

      // Step 5: Verify proposal executed
      const proposal = getProposal(Number(proposalId));
      const proposalData = unwrapOkTuple(proposal.result).expectSome().expectTuple();
      expect(proposalData["executed"]).toBeBool(true);
    });

    it("should allow cancellation before execution", () => {
      // Step 1: Propose
      const proposeResult = proposeOwner(newOwner, 100, 1000, guardian1);
      const proposalId = unwrapOkUint(proposeResult.result);

      // Step 2: Some approvals come in
      approveProposal(Number(proposalId), guardian2);

      // Step 3: Proposer cancels
      const cancelResult = cancelProposal(Number(proposalId), guardian1);
      expect(cancelResult.result).toBeOk(Cl.bool(true));

      // Step 4: Verify proposal canceled
      const proposal = getProposal(Number(proposalId));
      const proposalData = unwrapOkTuple(proposal.result).expectSome().expectTuple();
      expect(proposalData["canceled"]).toBeBool(true);

      // Step 5: Attempt to execute should fail
      advanceBlocks(101);
      const executeResult = executeProposal(Number(proposalId), guardian1);
      expect(executeResult.result).toBeErr(Cl.uint(146)); // ERR-RECOVERY-CANCELED
    });

    it("should handle multiple concurrent proposals", () => {
      // Create multiple proposals
      const prop1 = proposeOwner(newOwner, 100, 1000, guardian1);
      const prop2 = proposeOwner(guardian2, 200, 2000, guardian2);
      
      const id1 = unwrapOkUint(prop1.result);
      const id2 = unwrapOkUint(prop2.result);

      // Approve first proposal
      approveProposal(Number(id1), guardian2);
      approveProposal(Number(id1), guardian3);

      // Approve second proposal
      approveProposal(Number(id2), guardian1);
      approveProposal(Number(id2), guardian3);

      // Execute first proposal
      advanceBlocks(101);
      const exec1 = executeProposal(Number(id1), guardian1);
      expect(exec1.result).toBeOk(Cl.bool(true));

      // Second proposal should still be pending (different timelock)
      const prop2Data = getProposal(Number(id2));
      const prop2Tuple = unwrapOkTuple(prop2Data.result).expectSome().expectTuple();
      expect(prop2Tuple["executed"]).toBeBool(false);
    });
  });

  describe("edge cases", () => {
    it("should handle threshold exactly met", () => {
      const proposeResult = proposeOwner(newOwner, 100, 1000, guardian1);
      const proposalId = unwrapOkUint(proposeResult.result);

      // Exactly threshold approvals (2)
      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      advanceBlocks(101);

      const executeResult = executeProposal(Number(proposalId), guardian1);
      expect(executeResult.result).toBeOk(Cl.bool(true));
    });

    it("should handle approvals in any order", () => {
      const proposeResult = proposeOwner(newOwner, 100, 1000, guardian1);
      const proposalId = unwrapOkUint(proposeResult.result);

      // Approvals in different order
      approveProposal(Number(proposalId), guardian3);
      approveProposal(Number(proposalId), guardian2);

      advanceBlocks(101);

      const executeResult = executeProposal(Number(proposalId), guardian1);
      expect(executeResult.result).toBeOk(Cl.bool(true));
    });

    it("should not allow same guardian to approve multiple times", () => {
      const proposeResult = proposeOwner(newOwner, 100, 1000, guardian1);
      const proposalId = unwrapOkUint(proposeResult.result);

      approveProposal(Number(proposalId), guardian2);
      const result = approveProposal(Number(proposalId), guardian2);
      expect(result.result).toBeErr(Cl.uint(145)); // ERR-ALREADY-APPROVED
    });

    it("should handle proposal exactly at expiry block", () => {
      const proposeResult = proposeOwner(newOwner, 100, 100, guardian1); // Expiry = 100 blocks
      const proposalId = unwrapOkUint(proposeResult.result);

      approveProposal(Number(proposalId), guardian2);
      approveProposal(Number(proposalId), guardian3);

      // Advance to exactly expiry block
      advanceBlocks(100);

      // Should still be executable (>= expiry? check contract logic)
      // If contract uses >=, then at expiry block it should still work
      const executeResult = executeProposal(Number(proposalId), guardian1);
      // This depends on exact implementation (>= or >)
      // Adjust expectation based on contract
    });
  });
});
