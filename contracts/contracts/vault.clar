;; vault.clar - sBTC vault core (foundation)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-STATE  u111)

(define-data-var initialized bool false)
(define-data-var owner (optional principal) none)

(define-private (is-owner (who principal))
  (is-eq (var-get owner) (some who))
)

(define-public (init (new-owner principal))
  (begin
    (if (var-get initialized)
        (err ERR-INVALID-STATE)
        (begin
          (var-set owner (some new-owner))
          (var-set initialized true)
          (ok true)
        )
    )
  )
)

(define-read-only (get-status)
  (ok {
    initialized: (var-get initialized),
    owner: (var-get owner)
  })
)
