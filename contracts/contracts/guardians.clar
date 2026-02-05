;; guardians.clar - guardian set + threshold (foundation)

(define-constant ERR-NOT-AUTHORIZED      u100)
(define-constant ERR-INVALID-ARG         u110)
(define-constant ERR-THRESHOLD-INVALID   u120)

(define-data-var initialized bool false)
(define-data-var owner (optional principal) none)

(define-data-var guardian-threshold uint u0)
(define-data-var guardian-count uint u0)

(define-map guardians
  { who: principal }
  { active: bool }
)

(define-private (is-owner (who principal))
  (is-eq (var-get owner) (some who))
)

(define-read-only (is-guardian (who principal))
  (match (map-get? guardians { who: who })
    entry (ok (get active entry))
    (ok false)
  )
)

(define-public (init (new-owner principal) (threshold uint))
  (begin
    (if (var-get initialized)
        (err ERR-INVALID-ARG)
        (begin
          (if (is-eq threshold u0)
              (err ERR-THRESHOLD-INVALID)
              (begin
                (var-set owner (some new-owner))
                (var-set guardian-threshold threshold)
                (var-set guardian-count u0)
                (var-set initialized true)
                (ok true)
              )
          )
        )
    )
  )
)

(define-public (set-threshold (threshold uint))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (if (is-eq threshold u0)
            (err ERR-THRESHOLD-INVALID)
            (begin
              (var-set guardian-threshold threshold)
              (ok true)
            )
        )
    )
  )
)

(define-public (add-guardian (who principal))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (map-set guardians { who: who } { active: true })
          (var-set guardian-count (+ (var-get guardian-count) u1))
          (ok true)
        )
    )
  )
)

(define-public (remove-guardian (who principal))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (begin
          (map-delete guardians { who: who })
          ;; Note: for v0 we don't decrement count safely (needs existence check).
          ;; We'll harden this later when guardian lifecycle is finalized.
          (ok true)
        )
    )
  )
)

(define-read-only (get-threshold)
  (ok {
    initialized: (var-get initialized),
    owner: (var-get owner),
    threshold: (var-get guardian-threshold),
    guardian_count: (var-get guardian-count)
  })
)
