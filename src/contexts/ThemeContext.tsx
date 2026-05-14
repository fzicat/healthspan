'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
    setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'healthspan-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'dark'

        const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
        if (stored === 'light' || stored === 'dark') {
            return stored
        }

        return 'dark'
    })

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem(THEME_STORAGE_KEY, theme)
    }, [theme])

    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme)
    }, [])

    const toggleTheme = useCallback(() => {
        setThemeState(prev => prev === 'dark' ? 'light' : 'dark')
    }, [])

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
