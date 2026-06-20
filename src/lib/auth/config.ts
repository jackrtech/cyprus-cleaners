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
            .select('id, email, full_name, password_hash, role, avatar_url')
            .eq('email', credentials.email.toLowerCase().trim())
            .single()

          if (error || !user) return null

          const passwordMatch = await bcrypt.compare(
            credentials.password,
            user.password_hash
          )
          if (!passwordMatch) return null

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
  },
}
