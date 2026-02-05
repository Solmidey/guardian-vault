;; vault.clar - sBTC vault core (v2: recovery-authorized owner change + withdraw guardrails)

(use-trait sip010-ft-trait .sip010-ft-trait.sip010-ft-trait)

(define-constant ERR-NOT-AUTHORIZED      u100)
(define-constant ERR-INVALID-ARG         u110)
(define-constant ERR-INVALID-STATE       u111)
(define-constant ERR-COOLDOWN-ACTIVE     u130)
(define-constant ERR-DAILY-LIMIT         u131)

(define-constant DAY-BLOCKS u144)

(define-data-var initialized bool false)
(define-data-var owner (optional principal) none)

;; Token contract principal
(define-data-var token-contract (optional principal) none)

;; Recovery contract principal (authorizes owner rotation via contract-caller)
(define-data-var recovery-contract (optional principal) none)

;; Policy enforcement vars
(define-data-var daily-limit uint u0)
(define-data-var large-withdraw-threshold uint u0)
(define-data-var cooldown-blocks uint u0)

;; Accounting
(define-data-var daily-window-start uint u0)
(define-data-var daily-spent uint u0)
(define-data-var cooldown-until uint u0)

(define-private (is-owner (who principal))
  (is-eq (var-get owner) (some who))
)

(define-private (assert-token-matches (token <sip010-ft-trait>))
  (match (var-get token-contract)
    tc (if (is-eq tc (contract-of token))
           (ok true)
           (err ERR-INVALID-ARG))
    (err ERR-INVALID-STATE)
  )
)

(define-private (maybe-roll-day-window (bh uint))
  (let ((start (var-get daily-window-start)))
    (if (or (is-eq start u0) (>= bh (+ start DAY-BLOCKS)))
        (begin
          (var-set daily-window-start bh)
          (var-set daily-spent u0)
          true
        )
        false
    )
  )
)

(define-private (assert-within-daily-limit (amount uint))
  (let ((limit (var-get daily-limit)))
    (if (is-eq limit u0)
        (ok true)
        (let ((spent (var-get daily-spent)))
          (if (> (+ spent amount) limit)
              (err ERR-DAILY-LIMIT)
              (ok true)
          )
        )
    )
  )
)

(define-private (assert-cooldown-clear (bh uint))
  (let ((until (var-get cooldown-until)))
    (if (< bh until)
        (err ERR-COOLDOWN-ACTIVE)
        (ok true)
    )
  )
)

(define-public (init
    (new-owner principal)
    (token <sip010-ft-trait>)
    (recovery principal)
    (initial-daily-limit uint)
    (initial-large-withdraw-threshold uint)
    (initial-cooldown-blocks uint)
  )
  (begin
    (if (var-get initialized)
        (err ERR-INVALID-STATE)
        (begin
          (var-set owner (some new-owner))
          (var-set token-contract (some (contract-of token)))
          (var-set recovery-contract (some recovery))

          (var-set daily-limit initial-daily-limit)
          (var-set large-withdraw-threshold initial-large-withdraw-threshold)
          (var-set cooldown-blocks initial-cooldown-blocks)

          (var-set daily-window-start u0)
          (var-set daily-spent u0)
          (var-set cooldown-until u0)

          (var-set initialized true)
          (ok true)
        )
    )
  )
)

(define-public (set-policy
    (new-daily-limit uint)
    (new-large-withdraw-threshold uint)
    (new-cooldown-blocks uint)
  )
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (var-set daily-limit new-daily-limit)
          (var-set large-withdraw-threshold new-large-withdraw-threshold)
          (var-set cooldown-blocks new-cooldown-blocks)
          (ok true)
        )
    )
  )
)

(define-read-only (get-config)
  (ok {
    initialized: (var-get initialized),
    owner: (var-get owner),
    token_contract: (var-get token-contract),
    recovery_contract: (var-get recovery-contract),
    daily_limit: (var-get daily-limit),
    large_withdraw_threshold: (var-get large-withdraw-threshold),
    cooldown_blocks: (var-get cooldown-blocks),
    daily_window_start: (var-get daily-window-start),
    daily_spent: (var-get daily-spent),
    cooldown_until: (var-get cooldown-until)
  })
)

;; Called ONLY by the recovery contract (checked via contract-caller)
(define-public (set-owner-from-recovery (new-owner principal))
  (match (var-get recovery-contract)
    rc
      (if (is-eq contract-caller rc)
          (begin
            (var-set owner (some new-owner))
            (print { event: "owner-updated", new_owner: new-owner, by: contract-caller, block: block-height })
            (ok true)
          )
          (err ERR-NOT-AUTHORIZED)
      )
    (err ERR-INVALID-STATE)
  )
)

(define-public (withdraw (amount uint) (recipient principal) (token <sip010-ft-trait>))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (try! (assert-token-matches token))

          (let ((bh block-height))
            (maybe-roll-day-window bh)
            (try! (assert-cooldown-clear bh))
            (try! (assert-within-daily-limit amount))

            (let ((res (as-contract (contract-call? token transfer amount tx-sender recipient))))
              (match res
                okv (begin
                      (var-set daily-spent (+ (var-get daily-spent) amount))
                      (let ((th (var-get large-withdraw-threshold)))
                        (if (and (not (is-eq th u0)) (>= amount th))
                            (var-set cooldown-until (+ bh (var-get cooldown-blocks)))
                            true
                        )
                      )
                      (print { event: "withdraw", amount: amount, recipient: recipient, by: tx-sender, block: bh })
                      (ok okv)
                    )
                errv (err errv)
              )
            )
          )
        )
    )
  )
)

;; Read-only helper for recovery authorization
(define-read-only (get-owner)
  (ok (var-get owner))
)
