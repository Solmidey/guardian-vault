import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("guardian-vault", () => {
  it("mints mock sBTC to the vault and allows owner to withdraw", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");
    const vaultPrincipal = `${simnet.deployer}.vault`;

    const init = simnet.callPublicFn(
      "vault",
      "init",
      [
        Cl.principal(wallet1),
        token,
        Cl.uint(0),     // daily-limit disabled
        Cl.uint(0),     // large-withdraw disabled
        Cl.uint(0),     // cooldown blocks
      ],
      wallet1
    );
    expect(init.result).toBeOk(Cl.bool(true));

    const mint = simnet.callPublicFn(
      "mock-sbtc",
      "mint",
      [Cl.uint(1000), Cl.principal(vaultPrincipal)],
      wallet1
    );
    expect(mint.result).toBeOk(Cl.bool(true));

    const w = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.uint(250), Cl.principal(wallet2), token],
      wallet1
    );
    expect(w.result).toBeOk(Cl.bool(true));

    const w2bal = simnet.callReadOnlyFn(
      "mock-sbtc",
      "get-balance",
      [Cl.principal(wallet2)],
      wallet2
    );
    expect(w2bal.result).toBeOk(Cl.uint(250));
  });

  it("rejects withdraw when caller is not owner", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");

    const init = simnet.callPublicFn(
      "vault",
      "init",
      [Cl.principal(wallet1), token, Cl.uint(0), Cl.uint(0), Cl.uint(0)],
      wallet1
    );
    expect(init.result).toBeOk(Cl.bool(true));

    const fail = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.uint(1), Cl.principal(wallet2), token],
      wallet2
    );
    expect(fail.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
  });

  it("enforces daily limit", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");
    const vaultPrincipal = `${simnet.deployer}.vault`;

    const init = simnet.callPublicFn(
      "vault",
      "init",
      [Cl.principal(wallet1), token, Cl.uint(300), Cl.uint(0), Cl.uint(0)],
      wallet1
    );
    expect(init.result).toBeOk(Cl.bool(true));

    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(1000), Cl.principal(vaultPrincipal)], wallet1);

    // first withdraw 250 ok
    const ok1 = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.uint(250), Cl.principal(wallet2), token],
      wallet1
    );
    expect(ok1.result).toBeOk(Cl.bool(true));

    // second withdraw 100 should fail (250 + 100 > 300)
    const bad = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.uint(100), Cl.principal(wallet2), token],
      wallet1
    );
    expect(bad.result).toBeErr(Cl.uint(131)); // ERR-DAILY-LIMIT
  });

  it("enforces cooldown after large withdraw", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");
    const vaultPrincipal = `${simnet.deployer}.vault`;

    // daily limit disabled, large-withdraw threshold 400, cooldown 10 blocks
    const init = simnet.callPublicFn(
      "vault",
      "init",
      [Cl.principal(wallet1), token, Cl.uint(0), Cl.uint(400), Cl.uint(10)],
      wallet1
    );
    expect(init.result).toBeOk(Cl.bool(true));

    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(2000), Cl.principal(vaultPrincipal)], wallet1);

    // large withdraw triggers cooldown
    const big = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.uint(400), Cl.principal(wallet2), token],
      wallet1
    );
    expect(big.result).toBeOk(Cl.bool(true));

    // immediate second withdraw should fail due to cooldown
    const blocked = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.uint(1), Cl.principal(wallet2), token],
      wallet1
    );
    expect(blocked.result).toBeErr(Cl.uint(130)); // ERR-COOLDOWN-ACTIVE
  });
});
