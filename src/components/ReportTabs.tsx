'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const reportTabs = [
    { label: 'Workout', href: '/report/workout', enabled: true },
    { label: 'HRV', href: '/report/hrv', enabled: false },
    { label: 'Weight', href: '/report/weight', enabled: true },
]

export function ReportTabs() {
    const pathname = usePathname()

    return (
        <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Report sections">
            {reportTabs.map(tab => {
                if (!tab.enabled) {
                    return (
                        <span
                            key={tab.href}
                            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground opacity-70"
                            aria-disabled="true"
                        >
                            {tab.label}
                            <span className="text-[10px] uppercase tracking-wide">Soon</span>
                        </span>
                    )
                }

                const isActive = pathname === tab.href
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                            isActive
                                ? 'border-primary bg-primary text-background'
                                : 'border-border text-foreground hover:bg-muted'
                        }`}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        {tab.label}
                    </Link>
                )
            })}
        </nav>
    )
}
