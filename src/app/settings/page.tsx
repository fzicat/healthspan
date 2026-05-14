'use client'

import { useTheme } from '@/contexts/ThemeContext'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useToast } from '@/contexts/ToastContext'

export default function SettingsPage() {
    const { theme, toggleTheme } = useTheme()
    const router = useRouter()
    const { showToast } = useToast()
    const supabase = createClient()

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut()
        if (error) {
            showToast('Failed to sign out', 'error')
        } else {
            router.push('/login')
            router.refresh()
        }
    }

    return (
        <div className="max-w-md mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Settings</h1>

            <div className="space-y-4">
                {/* Theme Toggle */}
                <div className="bg-card rounded-xl p-4 border border-border">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-medium">Theme</h2>
                            <p className="text-sm text-muted-foreground">
                                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                            </p>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className="relative w-14 h-8 rounded-full bg-muted transition-colors"
                            role="switch"
                            aria-checked={theme === 'light'}
                            aria-label="Toggle theme"
                        >
                            <span
                                className={`
                  absolute top-1 w-6 h-6 rounded-full
                  transition-all duration-200 ease-out
                  flex items-center justify-center
                  ${theme === 'light'
                                        ? 'left-7 bg-primary'
                                        : 'left-1 bg-fg4'
                                    }
                `}
                            >
                                {theme === 'light' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-background">
                                        <circle cx="12" cy="12" r="5" />
                                        <line x1="12" y1="1" x2="12" y2="3" />
                                        <line x1="12" y1="21" x2="12" y2="23" />
                                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                        <line x1="1" y1="12" x2="3" y2="12" />
                                        <line x1="21" y1="12" x2="23" y2="12" />
                                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-background">
                                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                    </svg>
                                )}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Logout */}
                <div className="bg-card rounded-xl p-4 border border-border">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-between text-left"
                    >
                        <div>
                            <h2 className="font-medium text-destructive">Sign out</h2>
                            <p className="text-sm text-muted-foreground">
                                Log out of your account
                            </p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                </div>

                {/* App Info */}
                <div className="text-center text-sm text-muted-foreground pt-4">
                    <p>Healthspan</p>
                    <p>Version 1.0.0</p>
                </div>
            </div>
        </div>
    )
}
