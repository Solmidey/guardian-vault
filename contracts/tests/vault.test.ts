import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("guardian-vault", () => {
  it("mints mock sBTC to the vault and allows owner to withdraw", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");

    // init vault with token trait ref
    const init = simnet.callPublicFn(
      "vault",
      "init",
      [Cl.principal(wallet1), token],
      wallet1
    );
    expect(init.result).toBeOk(Cl.bool(true));

    const vaultPrincipal = `${simnet.deployer}.vault`;

    // mint 1000 to vault
    const mint = simnet.callPublicFn(
      "mock-sbtc",
      "mint",
      [Cl.uint(1000), Cl.principal(vaultPrincipal)],
      wallet1
    );
    expect(mint.result).toBeOk(Cl.bool(true));

    // vault balance from token contract
    const bal1 = simnet.callReadOnlyFn(
      "mock-sbtc",
      "get-balance",
      [Cl.principal(vaultPrincipal)],
      wallet1
    );
    expect(bal1.result).toBeOk(Cl.uint(1000));

    // withdraw 250 to wallet2 (pass token again)
    const w = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.uint(250), Cl.principal(wallet2), token],
      wallet1
    );
    expect(w.result).toBeOk(Cl.bool(true));

    const bal2 = simnet.callReadOnlyFn(
      "mock-sbtc",
      "get-balance",
      [Cl.principal(vaultPrincipal)],
      wallet1
    );
    expect(bal2.result).toBeOk(Cl.uint(750));

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
      [Cl.principal(wallet1), token],
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
});
