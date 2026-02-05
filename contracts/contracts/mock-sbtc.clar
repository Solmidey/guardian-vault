;; mock-sbtc.clar - TEST ONLY SIP-010 token used for local simnet tests

(define-constant ERR-UNAUTHORIZED u1)
(define-constant ERR-INSUFFICIENT u2)

(define-data-var total-supply uint u0)
(define-map balances { owner: principal } { balance: uint })

(define-public (mint (amount uint) (to principal))
  (begin
    (let (
      (current (default-to u0 (get balance (map-get? balances { owner: to }))))
    )
      (map-set balances { owner: to } { balance: (+ current amount) })
      (var-set total-supply (+ (var-get total-supply) amount))
      (ok true)
    )
  )
)

(define-read-only (get-name) (ok 0x6d6f636b2d73627463))        ;; "mock-sbtc"
(define-read-only (get-symbol) (ok 0x73425443))                ;; "sBTC"
(define-read-only (get-decimals) (ok u8))

(define-read-only (get-balance (who principal))
  (ok (default-to u0 (get balance (map-get? balances { owner: who }))))
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-public (transfer (amount uint) (sender principal) (recipient principal))
  (begin
    (if (not (is-eq tx-sender sender))
        (err ERR-UNAUTHORIZED)
        (let (
          (sender-bal (default-to u0 (get balance (map-get? balances { owner: sender }))))
          (recipient-bal (default-to u0 (get balance (map-get? balances { owner: recipient }))))
        )
          (if (< sender-bal amount)
              (err ERR-INSUFFICIENT)
              (begin
                (map-set balances { owner: sender } { balance: (- sender-bal amount) })
                (map-set balances { owner: recipient } { balance: (+ recipient-bal amount) })
                (ok true)
              )
          )
        )
    )
  )
)

(define-public (transfer-memo (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    memo
    (transfer amount sender recipient)
  )
)
