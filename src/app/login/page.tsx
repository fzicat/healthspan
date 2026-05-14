'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mode, setMode] = useState<'login' | 'signup'>('login')
    const router = useRouter()
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                })
                if (error) throw error
            }
            router.push('/')
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                {/* Logo/Title */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-primary mb-2">Healthspan</h1>
                    <p className="text-muted-foreground text-sm">
                        Strength training and healthspan logging
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-card rounded-xl p-6 shadow-lg border border-border">
                    <h2 className="text-xl font-semibold mb-6">
                        {mode === 'login' ? 'Welcome back' : 'Create account'}
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                className="w-full px-4 py-3 rounded-lg bg-muted border border-border
                         text-foreground placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary
                         text-base"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                minLength={6}
                                className="w-full px-4 py-3 rounded-lg bg-muted border border-border
                         text-foreground placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary
                         text-base"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 rounded-lg bg-primary text-background
                       font-semibold text-base
                       hover:bg-primary-dim transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       active:scale-[0.98] transition-transform"
                        >
                            {isLoading
                                ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                                : (mode === 'login' ? 'Sign in' : 'Create account')
                            }
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            type="button"
                            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                            className="text-sm text-primary hover:underline"
                        >
                            {mode === 'login'
                                ? "Don't have an account? Sign up"
                                : 'Already have an account? Sign in'
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
