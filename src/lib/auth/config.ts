import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
      avatar_url: string | null
    }
  }
  interface User {
    id: string
    email: string
    name: string
    role: UserRole
    avatar_url: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    avatar_url: string | null
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: {
    signIn:  '/login',
    signOut: '/login',
    error:   '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        try {
          const supabase = createAdminClient()

          const { data: user, error } = await supabase
            .from('users')
            .select('id, email, full_name, password_hash, role, avatar_url, deleted_at')
            .eq('email', credentials.email.toLowerCase().trim())
            .single()

          // Deleted accounts fall through to the same "no such user" outcome
          // as a genuinely unknown email — no separate "this account was
          // deleted" message, same anti-enumeration reasoning as everywhere
          // else auth failures are deliberately generic.
          if (error || !user || user.deleted_at) return null

          const passwordMatch = await bcrypt.compare(
            credentials.password,
            user.password_hash
          )
          if (!passwordMatch) return null

          // Best-effort, non-blocking — backs the admin analytics "active
          // cleaner" definition (last_login_at within 30 days). A failure
          // here should never block sign-in, so this isn't awaited into the
          // outer try/catch's failure path.
          supabase
            .from('users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', user.id)
            .then((result: { error: unknown }) => {
              if (result.error) console.error('[NextAuth] failed to stamp last_login_at:', result.error)
            })

          return {
            id:         user.id,
            email:      user.email,
            name:       user.full_name,
            role:       user.role as UserRole,
            avatar_url: user.avatar_url,
          }
        } catch (err) {
          console.error('[NextAuth] authorize error:', err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id         = user.id
        token.role       = user.role
        token.avatar_url = user.avatar_url
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id         = token.id
        session.user.role       = token.role
        session.user.avatar_url = token.avatar_url
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Relative callback URLs (e.g. the '/' in signOut({ callbackUrl: '/' }))
      // default to being resolved against NEXTAUTH_URL, which forces every
      // sign-in/out redirect onto that one host — breaks testing two sessions
      // at once via localhost vs 127.0.0.1. Keep same-origin redirects relative
      // so they stay on whichever host actually made the request.
      if (url.startsWith('/')) return url
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url
      } catch {
        // fall through to baseUrl below
      }
      return baseUrl
    },
  },
}
