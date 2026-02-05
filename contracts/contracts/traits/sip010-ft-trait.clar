;; SIP-010 Fungible Token Trait interface

(define-trait sip010-ft-trait
  (
    (transfer (uint principal principal) (response bool uint))
    (transfer-memo (uint principal principal (optional (buff 34))) (response bool uint))
    (get-name () (response (buff 32) uint))
    (get-symbol () (response (buff 32) uint))
    (get-decimals () (response uint uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
  )
)
