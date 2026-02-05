;; vault.clar - sBTC vault core (v0 token wiring; trait passed per-call)

(use-trait sip010-ft-trait .sip010-ft-trait.sip010-ft-trait)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-ARG    u110)
(define-constant ERR-INVALID-STATE  u111)

(define-data-var initialized bool false)
(define-data-var owner (optional principal) none)

;; Store token as contract principal (trait refs cannot be stored)
(define-data-var token-contract (optional principal) none)

(define-private (is-owner (who principal))
  (is-eq (var-get owner) (some who))
)

(define-private (assert-token-matches (token <sip010-ft-trait>))
  (match (var-get token-contract)
    tc (if (is-eq tc (contract-of token))
           (ok true)
           (err ERR-INVALID-ARG)
       )
    (err ERR-INVALID-STATE)
  )
)

(define-public (init (new-owner principal) (token <sip010-ft-trait>))
  (begin
    (if (var-get initialized)
        (err ERR-INVALID-STATE)
        (begin
          (var-set owner (some new-owner))
          (var-set token-contract (some (contract-of token)))
          (var-set initialized true)
          (ok true)
        )
    )
  )
)

(define-public (set-owner (new-owner principal))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (var-set owner (some new-owner))
          (ok true)
        )
    )
  )
)

(define-public (set-token (token <sip010-ft-trait>))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (var-set token-contract (some (contract-of token)))
          (ok true)
        )
    )
  )
)

(define-read-only (get-config)
  (ok {
    initialized: (var-get initialized),
    owner: (var-get owner),
    token_contract: (var-get token-contract)
  })
)

;; Withdraw tokens from the vault to a recipient.
;; token is passed as a trait ref and verified against stored token_contract.
(define-public (withdraw (amount uint) (recipient principal) (token <sip010-ft-trait>))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (try! (assert-token-matches token))
          ;; as-contract makes tx-sender the vault principal inside the call
          (as-contract (contract-call? token transfer amount tx-sender recipient))
        )
    )
  )
)
