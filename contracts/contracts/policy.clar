;; policy.clar - spending limits + cooldown policies (foundation)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-ARG    u110)
(define-constant ERR-INVALID-STATE  u111)

(define-data-var initialized bool false)
(define-data-var owner (optional principal) none)

(define-data-var daily-limit uint u0)
(define-data-var large-withdraw-threshold uint u0)
(define-data-var cooldown-blocks uint u0)

(define-private (is-owner (who principal))
  (is-eq (var-get owner) (some who))
)

(define-public (init
    (new-owner principal)
    (initial-daily-limit uint)
    (initial-large-withdraw-threshold uint)
    (initial-cooldown-blocks uint)
  )
  (begin
    (if (var-get initialized)
        (err ERR-INVALID-STATE)
        (begin
          (var-set owner (some new-owner))
          (var-set daily-limit initial-daily-limit)
          (var-set large-withdraw-threshold initial-large-withdraw-threshold)
          (var-set cooldown-blocks initial-cooldown-blocks)
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
          ;; Basic sanity: cooldown can be 0, limits can be 0 (disables feature).
          ;; If you want stronger rules, we'll add them later.
          (var-set daily-limit new-daily-limit)
          (var-set large-withdraw-threshold new-large-withdraw-threshold)
          (var-set cooldown-blocks new-cooldown-blocks)
          (ok true)
        )
    )
  )
)

(define-read-only (get-policy)
  (ok {
    initialized: (var-get initialized),
    owner: (var-get owner),
    daily-limit: (var-get daily-limit),
    large-withdraw-threshold: (var-get large-withdraw-threshold),
    cooldown-blocks: (var-get cooldown-blocks)
  })
)
