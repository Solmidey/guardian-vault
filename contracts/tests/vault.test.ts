import { describe, it, expect } from "vitest";
import { Cl, cvToString } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("guardian-vault", () => {
  it("mints mock sBTC to the vault and allows owner to withdraw", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");
    const vaultPrincipal = `${simnet.deployer}.vault`;
    const recoveryPrincipal = `${simnet.deployer}.recovery`;

    const gInit = simnet.callPublicFn("guardians", "init", [Cl.principal(wallet1), Cl.uint(1)], wallet1);
    expect(gInit.result).toBeOk(Cl.bool(true));

    const initVault = simnet.callPublicFn(
      "vault",
      "init",
      [Cl.principal(wallet1), token, Cl.principal(recoveryPrincipal), Cl.uint(0), Cl.uint(0), Cl.uint(0)],
      wallet1
    );
    expect(initVault.result).toBeOk(Cl.bool(true));

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

  it("enforces daily limit", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");
    const vaultPrincipal = `${simnet.deployer}.vault`;
    const recoveryPrincipal = `${simnet.deployer}.recovery`;

    expect(simnet.callPublicFn("guardians", "init", [Cl.principal(wallet1), Cl.uint(1)], wallet1).result).toBeOk(Cl.bool(true));

    expect(
      simnet.callPublicFn(
        "vault",
        "init",
        [Cl.principal(wallet1), token, Cl.principal(recoveryPrincipal), Cl.uint(300), Cl.uint(0), Cl.uint(0)],
        wallet1
      ).result
    ).toBeOk(Cl.bool(true));

    expect(simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(1000), Cl.principal(vaultPrincipal)], wallet1).result).toBeOk(Cl.bool(true));

    expect(simnet.callPublicFn("vault", "withdraw", [Cl.uint(250), Cl.principal(wallet2), token], wallet1).result).toBeOk(Cl.bool(true));

    const bad = simnet.callPublicFn("vault", "withdraw", [Cl.uint(100), Cl.principal(wallet2), token], wallet1);
    expect(bad.result).toBeErr(Cl.uint(131)); // ERR-DAILY-LIMIT
  });

  it("enforces cooldown after large withdraw", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");
    const vaultPrincipal = `${simnet.deployer}.vault`;
    const recoveryPrincipal = `${simnet.deployer}.recovery`;

    expect(simnet.callPublicFn("guardians", "init", [Cl.principal(wallet1), Cl.uint(1)], wallet1).result).toBeOk(Cl.bool(true));

    expect(
      simnet.callPublicFn(
        "vault",
        "init",
        [Cl.principal(wallet1), token, Cl.principal(recoveryPrincipal), Cl.uint(0), Cl.uint(400), Cl.uint(10)],
        wallet1
      ).result
    ).toBeOk(Cl.bool(true));

    expect(simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(2000), Cl.principal(vaultPrincipal)], wallet1).result).toBeOk(Cl.bool(true));

    expect(simnet.callPublicFn("vault", "withdraw", [Cl.uint(400), Cl.principal(wallet2), token], wallet1).result).toBeOk(Cl.bool(true));

    const blocked = simnet.callPublicFn("vault", "withdraw", [Cl.uint(1), Cl.principal(wallet2), token], wallet1);
    expect(blocked.result).toBeErr(Cl.uint(130)); // ERR-COOLDOWN-ACTIVE
  });

  it("guardian recovery changes vault owner after timelock and approvals", () => {
    const token = Cl.contractPrincipal(simnet.deployer, "mock-sbtc");
    const recoveryPrincipal = `${simnet.deployer}.recovery`;

    // init guardians with threshold 2
    expect(simnet.callPublicFn("guardians", "init", [Cl.principal(wallet1), Cl.uint(2)], wallet1).result).toBeOk(Cl.bool(true));

    // add guardians
    expect(simnet.callPublicFn("guardians", "add-guardian", [Cl.principal(wallet2)], wallet1).result).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("guardians", "add-guardian", [Cl.principal(wallet3)], wallet1).result).toBeOk(Cl.bool(true));

    // init vault: owner=wallet1, recovery authorized
    expect(
      simnet.callPublicFn(
        "vault",
        "init",
        [Cl.principal(wallet1), token, Cl.principal(recoveryPrincipal), Cl.uint(0), Cl.uint(0), Cl.uint(0)],
        wallet1
      ).result
    ).toBeOk(Cl.bool(true));

    const timelock = 10;

    const prop = simnet.callPublicFn(
      "recovery",
      "propose-owner",
      [Cl.principal(wallet2), Cl.uint(timelock), Cl.uint(50)],
      wallet1
    );
    expect(prop.result.type).toBe("ok");
    const proposalId = (prop.result as any).value.value;

    expect(simnet.callPublicFn("recovery", "approve", [Cl.uint(proposalId)], wallet2).result).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("recovery", "approve", [Cl.uint(proposalId)], wallet3).result).toBeOk(Cl.bool(true));

    const early = simnet.callPublicFn("recovery", "execute", [Cl.uint(proposalId)], wallet1);
    expect(early.result).toBeErr(Cl.uint(142)); // ERR-RECOVERY-TOO-EARLY

    for (let i = 0; i < timelock; i++) simnet.mineEmptyBlock();

    const ex = simnet.callPublicFn("recovery", "execute", [Cl.uint(proposalId)], wallet1);
    expect(ex.result).toBeOk(Cl.bool(true));

    const cfg = simnet.callReadOnlyFn("vault", "get-config", [], wallet1);

    // Robust assertion: stringify Clarity value and confirm owner is wallet2
    const cfgStr = cvToString(cfg.result);
    expect(cfgStr).toContain(wallet2);
    expect(cfgStr).toContain("owner");
  });
});
