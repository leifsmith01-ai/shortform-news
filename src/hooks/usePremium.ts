import { useUser } from '@clerk/clerk-react'

interface UsePremiumReturn {
  isPremium: boolean
  isLoaded: boolean
}

export function usePremium(): UsePremiumReturn {
  const { user, isLoaded } = useUser()

  const isPremium =
    isLoaded &&
    user != null &&
    (user.publicMetadata as Record<string, unknown>)?.plan === 'premium'

  return { isPremium, isLoaded }
}
