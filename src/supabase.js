import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
  || ''

const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env missing — email auth will not work until VITE_SUPABASE_* is set.')
}

export { supabaseUrl, supabaseKey }

const unavailableAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  refreshSession: async () => ({ data: { session: null }, error: null }),
  exchangeCodeForSession: async () => ({ data: { session: null }, error: null }),
  signOut: async () => ({ error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  : { auth: unavailableAuth }

export function supabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey)
}

function authRedirectTo() {
  return `${window.location.origin}/auth/callback`
}

function friendlyAuthError(error) {
  const message = String(error?.message || error || '')
  const status = error?.status
  if (/email not confirmed|email_not_confirmed/i.test(message)) {
    return 'Confirm your email first — check your inbox for the Pipa link.'
  }
  if (/invalid login credentials|invalid_credentials/i.test(message)) {
    return 'Email or password looks wrong.'
  }
  if (/user already registered|already been registered/i.test(message)) {
    return 'That email already has a nest. Sign in instead.'
  }
  if (/password should be|password.*least/i.test(message)) {
    return 'Password must be at least 8 characters.'
  }
  if (/rate limit|too many/i.test(message) || status === 429) {
    return 'Too many tries. Wait a moment, then try again.'
  }
  return message || 'Something went wrong with sign-in.'
}

/** Sign up with email/password. Returns { needsEmailConfirmation, session }. */
export async function signUpWithEmail(email, password, captchaToken) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanPassword = String(password || '')
  if (!cleanEmail || !cleanPassword) {
    throw new Error('Email and password are required.')
  }
  if (cleanPassword.length < 8) {
    throw new Error('Password must be at least 8 characters.')
  }
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password: cleanPassword,
    options: {
      emailRedirectTo: authRedirectTo(),
      captchaToken,
    },
  })
  if (error) throw new Error(friendlyAuthError(error))
  const session = data.session || null
  // When confirmations are on, Supabase returns a user but no session until verify.
  const needsEmailConfirmation = Boolean(data.user) && !session
  return { user: data.user, session, needsEmailConfirmation }
}

export async function signInWithEmail(email, password, captchaToken) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanPassword = String(password || '')
  if (!cleanEmail || !cleanPassword) {
    throw new Error('Email and password are required.')
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: cleanPassword,
    options: { captchaToken },
  })
  if (error) throw new Error(friendlyAuthError(error))
  if (!data.session?.access_token) {
    throw new Error('Confirm your email first — check your inbox for the Pipa link.')
  }
  return data.session
}

export async function resendSignupConfirmation(email) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail) throw new Error('Enter your email to resend the link.')
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: cleanEmail,
    options: {
      emailRedirectTo: authRedirectTo(),
    },
  })
  if (error) throw new Error(friendlyAuthError(error))
}

/** Best-effort legacy Supabase recovery email (SpeechC owns primary passwords now). */
export async function requestPasswordResetEmail(email, captchaToken) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail) throw new Error('Enter your email to reset the password.')
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${window.location.origin}/auth/reset`,
    captchaToken,
  })
  if (error) throw new Error(friendlyAuthError(error))
}

export async function getSupabaseSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function signOutSupabase() {
  await supabase.auth.signOut()
}
