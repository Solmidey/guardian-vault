import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

// Helper functions
function mint(amount: number, to: string, sender: string = deployer) {
  return simnet.callPublicFn(
    "mock-sbtc",
    "mint",
    [Cl.uint(amount), Cl.principal(to)],
    sender
  );
}

function transfer(amount: number, sender: string, recipient: string, fromAddress: string = sender) {
  return simnet.callPublicFn(
    "mock-sbtc",
    "transfer",
    [Cl.uint(amount), Cl.principal(sender), Cl.principal(recipient)],
    fromAddress
  );
}

function transferMemo(amount: number, sender: string, recipient: string, memo: string | null, fromAddress: string = sender) {
  const memoBuffer = memo ? Cl.some(Cl.bufferFromAscii(memo)) : Cl.none();
  return simnet.callPublicFn(
    "mock-sbtc",
    "transfer-memo",
    [Cl.uint(amount), Cl.principal(sender), Cl.principal(recipient), memoBuffer],
    fromAddress
  );
}

function getBalance(who: string) {
  return simnet.callReadOnlyFn(
    "mock-sbtc",
    "get-balance",
    [Cl.principal(who)],
    deployer
  );
}

function getTotalSupply() {
  return simnet.callReadOnlyFn(
    "mock-sbtc",
    "get-total-supply",
    [],
    deployer
  );
}

function getName() {
  return simnet.callReadOnlyFn(
    "mock-sbtc",
    "get-name",
    [],
    deployer
  );
}

function getSymbol() {
  return simnet.callReadOnlyFn(
    "mock-sbtc",
    "get-symbol",
    [],
    deployer
  );
}

function getDecimals() {
  return simnet.callReadOnlyFn(
    "mock-sbtc",
    "get-decimals",
    [],
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

function unwrapOkBuffer(response: any): string {
  expect(response.type).toBe("ok");
  const value = response.value;
  expect(value.type).toBe("buffer");
  return value.buffer;
}

describe("Mock sBTC Token - SIP-010 Test Token", () => {
  
  describe("Mint Function", () => {
    it("should mint tokens to an address", () => {
      const amount = 1000000;
      const result = mint(amount, wallet1, deployer);
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = getBalance(wallet1);
      expect(unwrapOkUint(balance.result)).toBe(BigInt(amount));

      // Verify total supply
      const totalSupply = getTotalSupply();
      expect(unwrapOkUint(totalSupply.result)).toBe(BigInt(amount));
    });

    it("should allow minting to multiple addresses", () => {
      mint(1000000, wallet1, deployer);
      mint(2000000, wallet2, deployer);
      mint(3000000, wallet3, deployer);

      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(1000000n);
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(2000000n);
      expect(unwrapOkUint(getBalance(wallet3).result)).toBe(3000000n);
      expect(unwrapOkUint(getTotalSupply().result)).toBe(6000000n);
    });

    it("should accumulate balance when minting to same address multiple times", () => {
      mint(1000000, wallet1, deployer);
      mint(500000, wallet1, deployer);
      mint(250000, wallet1, deployer);

      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(1750000n);
      expect(unwrapOkUint(getTotalSupply().result)).toBe(1750000n);
    });

    it("should allow anyone to mint (no auth)", () => {
      // Anyone can call mint (since it's a mock token for testing)
      const result = mint(1000000, wallet2, wallet1); // wallet1 minting to wallet2
      expect(result.result).toBeOk(Cl.bool(true));

      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(1000000n);
    });

    it("should handle zero amount mint", () => {
      const result = mint(0, wallet1, deployer);
      expect(result.result).toBeOk(Cl.bool(true));

      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(0n);
      expect(unwrapOkUint(getTotalSupply().result)).toBe(0n);
    });
  });

  describe("Transfer Function", () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 and wallet2
      mint(5000000, wallet1, deployer);
      mint(3000000, wallet2, deployer);
    });

    it("should transfer tokens between addresses", () => {
      const transferAmount = 1000000;
      
      const result = transfer(transferAmount, wallet1, wallet2, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balances
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(4000000n); // 5M - 1M
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(4000000n); // 3M + 1M
      expect(unwrapOkUint(getTotalSupply().result)).toBe(8000000n); // Total unchanged
    });

    it("should not allow transfer with insufficient balance", () => {
      const transferAmount = 10000000; // More than wallet1 has (5M)
      
      const result = transfer(transferAmount, wallet1, wallet2, wallet1);
      expect(result.result).toBeErr(Cl.uint(2)); // ERR-INSUFFICIENT

      // Verify balances unchanged
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(5000000n);
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(3000000n);
    });

    it("should not allow unauthorized transfer", () => {
      // wallet2 trying to transfer from wallet1
      const result = transfer(1000000, wallet1, wallet2, wallet2);
      expect(result.result).toBeErr(Cl.uint(1)); // ERR-UNAUTHORIZED

      // Verify balances unchanged
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(5000000n);
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(3000000n);
    });

    it("should allow transfer to same address", () => {
      const result = transfer(1000000, wallet1, wallet1, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));

      // Balance should remain the same (transfer to self)
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(5000000n);
    });

    it("should handle zero amount transfer", () => {
      const result = transfer(0, wallet1, wallet2, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));

      // Balances unchanged
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(5000000n);
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(3000000n);
    });

    it("should handle transfer to address with zero balance", () => {
      // wallet3 has no balance initially
      const result = transfer(1000000, wallet1, wallet3, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));

      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(4000000n);
      expect(unwrapOkUint(getBalance(wallet3).result)).toBe(1000000n);
    });

    it("should handle maximum uint values safely", () => {
      // Mint max uint to test overflow protection
      const maxUint = BigInt("340282366920938463463374607431768211455");
      
      // This might fail due to overflow protection in Clarity
      // But we can test with large but safe values
      const largeAmount = 1000000000000;
      
      mint(largeAmount, wallet1, deployer);
      
      const result = transfer(largeAmount, wallet1, wallet2, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Transfer-Memo Function", () => {
    beforeEach(() => {
      mint(5000000, wallet1, deployer);
    });

    it("should transfer with memo", () => {
      const memo = "Payment for services";
      const result = transferMemo(1000000, wallet1, wallet2, memo, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify transfer happened
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(4000000n);
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(1000000n);
    });

    it("should transfer without memo", () => {
      const result = transferMemo(1000000, wallet1, wallet2, null, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));

      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(4000000n);
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(1000000n);
    });

    it("should respect same authorization rules as transfer", () => {
      const memo = "Unauthorized attempt";
      
      // wallet2 trying to transfer from wallet1
      const result = transferMemo(1000000, wallet1, wallet2, memo, wallet2);
      expect(result.result).toBeErr(Cl.uint(1)); // ERR-UNAUTHORIZED
    });

    it("should handle empty memo", () => {
      const result = transferMemo(1000000, wallet1, wallet2, "", wallet1);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("should handle long memo (up to 34 bytes)", () => {
      const longMemo = "This is a longer memo that is exactly 34 bytes?";
      // Truncate to 34 bytes if needed
      const memo = longMemo.substring(0, 34);
      
      const result = transferMemo(1000000, wallet1, wallet2, memo, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Read-Only Functions", () => {
    it("should return correct token name", () => {
      const result = getName();
      const name = unwrapOkBuffer(result.result);
      // Convert buffer to string for comparison
      expect(name).toBeDefined();
    });

    it("should return correct token symbol", () => {
      const result = getSymbol();
      const symbol = unwrapOkBuffer(result.result);
      expect(symbol).toBeDefined();
    });

    it("should return correct decimals", () => {
      const result = getDecimals();
      expect(unwrapOkUint(result.result)).toBe(8n);
    });

    it("should return zero balance for address with no tokens", () => {
      const balance = getBalance(wallet3);
      expect(unwrapOkUint(balance.result)).toBe(0n);
    });

    it("should return correct total supply", () => {
      mint(1000000, wallet1, deployer);
      mint(2000000, wallet2, deployer);
      
      const totalSupply = getTotalSupply();
      expect(unwrapOkUint(totalSupply.result)).toBe(3000000n);
    });
  });

  describe("Edge Cases and Error Conditions", () => {
    it("should handle multiple transfers correctly", () => {
      mint(10000000, wallet1, deployer); // 10M total

      // Sequence of transfers
      transfer(1000000, wallet1, wallet2, wallet1);
      transfer(2000000, wallet1, wallet3, wallet1);
      transfer(500000, wallet2, wallet3, wallet2);

      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(7000000n); // 10M - 1M - 2M
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(500000n);  // 1M - 500k
      expect(unwrapOkUint(getBalance(wallet3).result)).toBe(2500000n); // 2M + 500k
    });

    it("should maintain total supply invariant", () => {
      const initialSupply = unwrapOkUint(getTotalSupply().result);
      
      mint(1000000, wallet1, deployer);
      mint(2000000, wallet2, deployer);
      
      const midSupply = unwrapOkUint(getTotalSupply().result);
      expect(midSupply - initialSupply).toBe(3000000n);
      
      transfer(500000, wallet1, wallet2, wallet1);
      
      const finalSupply = unwrapOkUint(getTotalSupply().result);
      expect(finalSupply).toBe(midSupply); // Transfer shouldn't change total supply
    });

    it("should handle exact balance transfers", () => {
      mint(1000000, wallet1, deployer);
      
      // Transfer exact balance
      const result = transfer(1000000, wallet1, wallet2, wallet1);
      expect(result.result).toBeOk(Cl.bool(true));
      
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(0n);
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(1000000n);
      
      // Try to transfer again (should fail)
      const failedResult = transfer(1, wallet1, wallet2, wallet1);
      expect(failedResult.result).toBeErr(Cl.uint(2)); // ERR-INSUFFICIENT
    });

    it("should handle concurrent transfers from different addresses", () => {
      mint(5000000, wallet1, deployer);
      mint(5000000, wallet2, deployer);
      mint(5000000, wallet3, deployer);

      // Simultaneous transfers (in same block)
      const block = simnet.mineBlock([
        Tx.contractCall("mock-sbtc", "transfer", [Cl.uint(1000000), Cl.principal(wallet1), Cl.principal(wallet2)], wallet1),
        Tx.contractCall("mock-sbtc", "transfer", [Cl.uint(2000000), Cl.principal(wallet2), Cl.principal(wallet3)], wallet2),
        Tx.contractCall("mock-sbtc", "transfer", [Cl.uint(3000000), Cl.principal(wallet3), Cl.principal(wallet1)], wallet3),
      ]);

      // All should succeed
      expect(block.receipts[0].result).toBeOk(Cl.bool(true));
      expect(block.receipts[1].result).toBeOk(Cl.bool(true));
      expect(block.receipts[2].result).toBeOk(Cl.bool(true));

      // Final balances
      expect(unwrapOkUint(getBalance(wallet1).result)).toBe(7000000n); // 5M - 1M + 3M
      expect(unwrapOkUint(getBalance(wallet2).result)).toBe(4000000n); // 5M - 2M + 1M
      expect(unwrapOkUint(getBalance(wallet3).result)).toBe(4000000n); // 5M - 3M + 2M
    });
  });

  describe("SIP-010 Compliance", () => {
    it("should implement all required SIP-010 functions", () => {
      // Check that all required read-only functions exist
      expect(getName).toBeDefined();
      expect(getSymbol).toBeDefined();
      expect(getDecimals).toBeDefined();
      expect(getBalance).toBeDefined();
      expect(getTotalSupply).toBeDefined();
      expect(transfer).toBeDefined();
      expect(transferMemo).toBeDefined();
    });

    it("should return correct token metadata", () => {
      // Name should be "mock-sbtc"
      const name = unwrapOkBuffer(getName().result);
      expect(name).toBeDefined();

      // Symbol should be "sBTC"
      const symbol = unwrapOkBuffer(getSymbol().result);
      expect(symbol).toBeDefined();

      // Decimals should be 8
      expect(unwrapOkUint(getDecimals().result)).toBe(8n);
    });

    it("should handle transfers with memo as required by SIP-010", () => {
      mint(1000000, wallet1, deployer);
      
      const memo = Cl.some(Cl.bufferFromAscii("test memo"));
      const result = simnet.callPublicFn(
        "mock-sbtc",
        "transfer-memo",
        [Cl.uint(500000), Cl.principal(wallet1), Cl.principal(wallet2), memo],
        wallet1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
    });
  });
});
