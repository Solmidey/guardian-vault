;; recovery.clar - guardian recovery (v2: propose/approve/cancel/execute + get-proposal)
;; NOTE: uses fixed companion contracts .guardians and .vault

(define-constant ERR-NOT-AUTHORIZED        u100)
(define-constant ERR-INVALID-ARG           u110)
(define-constant ERR-INVALID-STATE         u111)
(define-constant ERR-RECOVERY-TOO-EARLY    u142)
(define-constant ERR-ALREADY-APPROVED      u145)
(define-constant ERR-RECOVERY-CANCELED     u146)
(define-constant ERR-RECOVERY-EXPIRED      u147)
(define-constant ERR-RECOVERY_EXECUTED     u148)

(define-data-var proposal-nonce uint u0)

(define-map proposals
  { id: uint }
  {
    new_owner: principal,
    proposer: principal,
    created_at: uint,
    execute_after: uint,
    expires_at: uint,
    approvals: uint,
    executed: bool,
    canceled: bool
  }
)

(define-map approvals
  { id: uint, guardian: principal }
  { approved: bool }
)

(define-private (is-active-guardian (who principal))
  (unwrap-panic (contract-call? .guardians is-guardian who))
)

(define-private (threshold)
  (unwrap-panic (contract-call? .guardians get-threshold))
)

(define-private (current-vault-owner)
  ;; vault.get-owner returns (response (optional principal) uint)
  (unwrap-panic (contract-call? .vault get-owner))
)

(define-private (is-proposer-or-owner (p (tuple
    (new_owner principal)
    (proposer principal)
    (created_at uint)
    (execute_after uint)
    (expires_at uint)
    (approvals uint)
    (executed bool)
    (canceled bool)
  )))
  (let ((o (current-vault-owner)))
    (or
      (is-eq tx-sender (get proposer p))
      (is-eq o (some tx-sender))
    )
  )
)

;; Read-only: return proposal (optional tuple)
(define-read-only (get-proposal (id uint))
  (ok (map-get? proposals { id: id }))
)

(define-public (propose-owner (new-owner principal) (timelock-blocks uint) (expiry-blocks uint))
  (begin
    (if (is-eq expiry-blocks u0)
        (err ERR-INVALID-ARG)
        (let (
          (id (+ (var-get proposal-nonce) u1))
          (now block-height)
          (exec (+ block-height timelock-blocks))
          (exp (+ block-height expiry-blocks))
        )
          (map-set proposals
            { id: id }
            {
              new_owner: new-owner,
              proposer: tx-sender,
              created_at: now,
              execute_after: exec,
              expires_at: exp,
              approvals: u0,
              executed: false,
              canceled: false
            }
          )
          (var-set proposal-nonce id)
          (print { event: "recovery-proposed", id: id, new_owner: new-owner, by: tx-sender, block: now })
          (ok id)
        )
    )
  )
)

(define-public (cancel (id uint))
  (match (map-get? proposals { id: id })
    p
      (begin
        (if (get executed p) (err ERR-RECOVERY_EXECUTED)
          (if (get canceled p) (err ERR-RECOVERY-CANCELED)
            (if (>= block-height (get expires_at p)) (err ERR-RECOVERY-EXPIRED)
              (if (not (is-proposer-or-owner p)) (err ERR-NOT-AUTHORIZED)
                (begin
                  (map-set proposals { id: id } (merge p { canceled: true }))
                  (print { event: "recovery-canceled", id: id, by: tx-sender, block: block-height })
                  (ok true)
                )
              )
            )
          )
        )
      )
    (err ERR-INVALID-ARG)
  )
)

(define-public (approve (id uint))
  (begin
    (if (not (is-active-guardian tx-sender))
        (err ERR-NOT-AUTHORIZED)
        (match (map-get? proposals { id: id })
          p
            (begin
              (if (get executed p) (err ERR-RECOVERY_EXECUTED)
                (if (get canceled p) (err ERR-RECOVERY-CANCELED)
                  (if (>= block-height (get expires_at p)) (err ERR-RECOVERY-EXPIRED)
                    (match (map-get? approvals { id: id, guardian: tx-sender })
                      a (err ERR-ALREADY-APPROVED)
                      (begin
                        (map-set approvals { id: id, guardian: tx-sender } { approved: true })
                        (map-set proposals { id: id } (merge p { approvals: (+ (get approvals p) u1) }))
                        (print { event: "recovery-approved", id: id, guardian: tx-sender, block: block-height })
                        (ok true)
                      )
                    )
                  )
                )
              )
            )
          (err ERR-INVALID-ARG)
        )
    )
  )
)

(define-public (execute (id uint))
  (match (map-get? proposals { id: id })
    p
      (begin
        (if (get executed p) (err ERR-RECOVERY_EXECUTED)
          (if (get canceled p) (err ERR-RECOVERY-CANCELED)
            (if (>= block-height (get expires_at p)) (err ERR-RECOVERY-EXPIRED)
              (if (< block-height (get execute_after p))
                  (err ERR-RECOVERY-TOO-EARLY)
                  (let ((need (threshold)))
                    (if (< (get approvals p) need)
                        (err ERR-NOT-AUTHORIZED)
                        (let ((res (contract-call? .vault set-owner-from-recovery (get new_owner p))))
                          (match res
                            okv (begin
                                  (map-set proposals { id: id } (merge p { executed: true }))
                                  (print { event: "recovery-executed", id: id, new_owner: (get new_owner p), block: block-height })
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
        )
      )
    (err ERR-INVALID-ARG)
  )
)
