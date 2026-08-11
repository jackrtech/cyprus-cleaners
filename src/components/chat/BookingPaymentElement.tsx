'use client'

import { useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export interface BookingPaymentHandle {
  // Resolves to a saved payment method id, or throws with a user-facing message
  confirmCard: () => Promise<string>
}

interface Props {
  clientSecret: string
  onReady: (handle: BookingPaymentHandle | null) => void
}

function Inner({ onReady }: { onReady: Props['onReady'] }) {
  const stripe = useStripe()
  const elements = useElements()

  useEffect(() => {
    if (!stripe || !elements) { onReady(null); return }
    onReady({
      confirmCard: async () => {
        const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: 'if_required' })
        if (error) throw new Error(error.message ?? 'Card confirmation failed')
        const paymentMethod = setupIntent?.payment_method
        if (!paymentMethod || typeof paymentMethod !== 'string') {
          throw new Error('No payment method returned')
        }
        return paymentMethod
      },
    })
    return () => onReady(null)
  }, [stripe, elements, onReady])

  return <PaymentElement />
}

export default function BookingPaymentElement({ clientSecret, onReady }: Props) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <Inner onReady={onReady} />
    </Elements>
  )
}
