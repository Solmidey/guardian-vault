;; guardians.clar - guardian set + threshold (v2 hardened)

(define-constant ERR-NOT-AUTHORIZED      u100)
(define-constant ERR-INVALID-ARG         u110)
(define-constant ERR-ALREADY-EXISTS      u112)
(define-constant ERR-NOT-FOUND           u113)
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

(define-private (exists? (who principal))
  (is-some (map-get? guardians { who: who }))
)

(define-public (init (new-owner principal) (threshold uint))
  (begin
    (if (var-get initialized)
        (err ERR-INVALID-ARG)
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

(define-public (set-threshold (threshold uint))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (if (is-eq threshold u0)
            (err ERR-THRESHOLD-INVALID)
            (let ((count (var-get guardian-count)))
              ;; if count > 0, threshold must be <= count
              (if (and (> count u0) (> threshold count))
                  (err ERR-THRESHOLD-INVALID)
                  (begin
                    (var-set guardian-threshold threshold)
                    (ok true)
                  )
              )
            )
        )
    )
  )
)

(define-public (add-guardian (who principal))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (if (exists? who)
            (err ERR-ALREADY-EXISTS)
            (begin
              (map-set guardians { who: who } { active: true })
              (var-set guardian-count (+ (var-get guardian-count) u1))
              (print { event: "guardian-added", who: who, by: tx-sender, block: block-height })
              (ok true)
            )
        )
    )
  )
)

(define-public (remove-guardian (who principal))
  (begin
    (if (not (is-owner tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (if (not (exists? who))
            (err ERR-NOT-FOUND)
            (let (
              (count (var-get guardian-count))
              (new-count (if (> count u0) (- count u1) u0))
              (th (var-get guardian-threshold))
            )
              ;; If there will still be guardians left, threshold cannot exceed new-count
              (if (and (> new-count u0) (> th new-count))
                  (err ERR-THRESHOLD-INVALID)
                  (begin
                    (map-delete guardians { who: who })
                    (var-set guardian-count new-count)
                    (print { event: "guardian-removed", who: who, by: tx-sender, block: block-height })
                    (ok true)
                  )
              )
            )
        )
    )
  )
)

(define-read-only (is-guardian (who principal))
  (match (map-get? guardians { who: who })
    entry (ok (get active entry))
    (ok false)
  )
)

(define-read-only (get-threshold)
  (ok (var-get guardian-threshold))
)

(define-read-only (get-guardian-count)
  (ok (var-get guardian-count))
)
