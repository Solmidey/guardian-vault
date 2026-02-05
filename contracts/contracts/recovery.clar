;; recovery.clar - recovery proposals + approvals (foundation)

(define-constant ERR-NOT-AUTHORIZED        u100)
(define-constant ERR-INVALID-STATE         u111)
(define-constant ERR-RECOVERY-NOT-ACTIVE   u141)

(define-data-var initialized bool false)
(define-data-var owner (optional principal) none)

(define-data-var recovery-active bool false)

(define-private (is-owner (who principal))
  (is-eq (var-get owner) (some who))
)

(define-public (init (new-owner principal))
  (begin
    (if (var-get initialized)
        (err ERR-INVALID-STATE)
        (begin
          (var-set owner (some new-owner))
          (var-set recovery-active false)
          (var-set initialized true)
          (ok true)
        )
    )
  )
)

(define-public (set-recovery-active (active bool))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (var-set recovery-active active)
          (ok true)
        )
    )
  )
)

(define-read-only (is-recovery-active)
  (ok (var-get recovery-active))
)

(define-read-only (assert-recovery-active)
  (if (var-get recovery-active)
      (ok true)
      (err ERR-RECOVERY-NOT-ACTIVE)
  )
)
