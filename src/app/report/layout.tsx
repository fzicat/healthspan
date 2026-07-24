import { ReportTabs } from '@/components/ReportTabs'

export default function ReportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="mx-auto max-w-[1600px] py-6">
            <header className="mb-5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Analytics</p>
                <h1 className="text-2xl font-bold text-foreground">Report</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Review your training and health trends over time.
                </p>
            </header>
            <ReportTabs />
            {children}
        </div>
    )
}
