;; errors.clar - error code catalog

(define-constant ERR-NOT-AUTHORIZED            u100)
(define-constant ERR-NOT-OWNER                 u101)
(define-constant ERR-NOT-GUARDIAN              u102)

(define-constant ERR-INVALID-ARG               u110)
(define-constant ERR-INVALID-STATE             u111)
(define-constant ERR-ALREADY-EXISTS            u112)
(define-constant ERR-NOT-FOUND                 u113)

(define-constant ERR-THRESHOLD-INVALID         u120)
(define-constant ERR-COOLDOWN-ACTIVE           u130)
(define-constant ERR-DAILY-LIMIT               u131)
(define-constant ERR-INSUFFICIENT-BALANCE      u132)

(define-constant ERR-RECOVERY-ACTIVE           u140)
(define-constant ERR-RECOVERY-NOT-ACTIVE       u141)
(define-constant ERR-RECOVERY-TOO-EARLY        u142)

(define-read-only (is-known (code uint))
  (ok (or
    (is-eq code ERR-NOT-AUTHORIZED)
    (is-eq code ERR-NOT-OWNER)
    (is-eq code ERR-NOT-GUARDIAN)
    (is-eq code ERR-INVALID-ARG)
    (is-eq code ERR-INVALID-STATE)
    (is-eq code ERR-ALREADY-EXISTS)
    (is-eq code ERR-NOT-FOUND)
    (is-eq code ERR-THRESHOLD-INVALID)
    (is-eq code ERR-COOLDOWN-ACTIVE)
    (is-eq code ERR-DAILY-LIMIT)
    (is-eq code ERR-INSUFFICIENT-BALANCE)
    (is-eq code ERR-RECOVERY-ACTIVE)
    (is-eq code ERR-RECOVERY-NOT-ACTIVE)
    (is-eq code ERR-RECOVERY-TOO-EARLY)
  ))
)
