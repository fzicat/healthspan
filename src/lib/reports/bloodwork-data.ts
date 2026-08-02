export type BloodworkMetricKey =
    | 'apob'
    | 'ldl'
    | 'totalCholesterol'
    | 'hdl'
    | 'triglycerides'
    | 'hba1c'
    | 'fastingGlucose'
    | 'creatinine'
    | 'egfr'
    | 'lpa'
    | 'crp'

export type BloodworkCategory = 'Cardiovascular' | 'Metabolic' | 'Kidney'
export type BloodworkAccent = 'orange' | 'red' | 'yellow' | 'aqua' | 'green' | 'purple' | 'blue'

export type BloodworkPanel = {
    date: string
    apob?: number
    ldl?: number
    totalCholesterol?: number
    hdl?: number
    triglycerides?: number
    hba1c?: number
    fastingGlucose?: number
    creatinine?: number
    egfr?: number
    lpa?: number
    crp?: number
}

export type BloodworkMetric = {
    key: BloodworkMetricKey
    label: string
    shortLabel: string
    category: BloodworkCategory
    unit: string
    decimals: number
    accent: BloodworkAccent
    latestReference: string
}

export const BLOODWORK_PANELS: BloodworkPanel[] = [
    {
        date: '2022-02-28',
        apob: 1.15,
        ldl: 4.3,
        totalCholesterol: 5.98,
        hdl: 1.13,
        triglycerides: 1.17,
        hba1c: 5.1,
        creatinine: 105,
        egfr: 73,
        crp: 3.5,
    },
    {
        date: '2022-06-01',
        apob: 1.32,
        creatinine: 86,
        egfr: 93,
        lpa: 99,
    },
    {
        date: '2022-11-03',
        apob: 1.49,
        ldl: 4.89,
        totalCholesterol: 6.89,
        hdl: 1.6,
        triglycerides: 0.87,
        hba1c: 4.9,
        fastingGlucose: 4.8,
        creatinine: 113,
        egfr: 67,
        lpa: 82,
    },
    {
        date: '2023-05-11',
        ldl: 4.2,
        totalCholesterol: 5.76,
        hdl: 1.09,
        triglycerides: 1,
        hba1c: 5.1,
        creatinine: 133,
        egfr: 55,
        crp: 1.2,
    },
    {
        date: '2023-10-26',
        apob: 1.21,
        ldl: 4.2,
        totalCholesterol: 5.68,
        hdl: 1.13,
        triglycerides: 0.73,
        fastingGlucose: 4.8,
        creatinine: 121,
        egfr: 61,
    },
    {
        date: '2024-05-21',
        apob: 0.83,
        ldl: 2.6,
        totalCholesterol: 3.96,
        hdl: 1.03,
        triglycerides: 0.7,
    },
    {
        date: '2024-10-16',
        apob: 0.89,
        ldl: 2.6,
        totalCholesterol: 4.05,
        hdl: 1.1,
        triglycerides: 0.87,
        hba1c: 5.3,
        fastingGlucose: 4.8,
        creatinine: 118,
        egfr: 63,
    },
    {
        date: '2026-05-12',
        ldl: 3.2,
        totalCholesterol: 5.05,
        hdl: 1.6,
        triglycerides: 0.6,
        hba1c: 5.4,
        creatinine: 115,
        egfr: 64,
    },
    {
        date: '2026-07-29',
        apob: 0.5,
        ldl: 1.22,
        totalCholesterol: 3,
        hdl: 1.42,
        triglycerides: 0.55,
        hba1c: 5.3,
        fastingGlucose: 4.89,
        creatinine: 130,
        egfr: 58,
        lpa: 107,
        crp: 1.3,
    },
]

export const BLOODWORK_METRICS: BloodworkMetric[] = [
    {
        key: 'apob',
        label: 'Apolipoprotein B',
        shortLabel: 'ApoB',
        category: 'Cardiovascular',
        unit: 'g/L',
        decimals: 2,
        accent: 'orange',
        latestReference: '< 0.90 g/L',
    },
    {
        key: 'ldl',
        label: 'LDL cholesterol',
        shortLabel: 'LDL-C',
        category: 'Cardiovascular',
        unit: 'mmol/L',
        decimals: 2,
        accent: 'red',
        latestReference: '< 2.59 mmol/L',
    },
    {
        key: 'totalCholesterol',
        label: 'Total cholesterol',
        shortLabel: 'Total chol.',
        category: 'Cardiovascular',
        unit: 'mmol/L',
        decimals: 2,
        accent: 'yellow',
        latestReference: '< 5.18 mmol/L',
    },
    {
        key: 'hdl',
        label: 'HDL cholesterol',
        shortLabel: 'HDL-C',
        category: 'Cardiovascular',
        unit: 'mmol/L',
        decimals: 2,
        accent: 'aqua',
        latestReference: '≥ 1.04 mmol/L',
    },
    {
        key: 'triglycerides',
        label: 'Triglycerides',
        shortLabel: 'Triglycerides',
        category: 'Cardiovascular',
        unit: 'mmol/L',
        decimals: 2,
        accent: 'green',
        latestReference: '< 1.69 mmol/L',
    },
    {
        key: 'lpa',
        label: 'Lipoprotein(a)',
        shortLabel: 'Lp(a)',
        category: 'Cardiovascular',
        unit: 'nmol/L',
        decimals: 0,
        accent: 'red',
        latestReference: '< 75 nmol/L',
    },
    {
        key: 'hba1c',
        label: 'Hemoglobin A1c',
        shortLabel: 'HbA1c',
        category: 'Metabolic',
        unit: '%',
        decimals: 1,
        accent: 'purple',
        latestReference: '< 5.7%',
    },
    {
        key: 'fastingGlucose',
        label: 'Fasting glucose',
        shortLabel: 'Glucose',
        category: 'Metabolic',
        unit: 'mmol/L',
        decimals: 2,
        accent: 'blue',
        latestReference: '3.61–5.50 mmol/L',
    },
    {
        key: 'crp',
        label: 'C-reactive protein',
        shortLabel: 'hs-CRP / CRP',
        category: 'Metabolic',
        unit: 'mg/L',
        decimals: 1,
        accent: 'yellow',
        latestReference: 'Optimal < 1.0 mg/L',
    },
    {
        key: 'creatinine',
        label: 'Creatinine',
        shortLabel: 'Creatinine',
        category: 'Kidney',
        unit: 'µmol/L',
        decimals: 0,
        accent: 'orange',
        latestReference: '62–115 µmol/L',
    },
    {
        key: 'egfr',
        label: 'Estimated GFR',
        shortLabel: 'eGFR',
        category: 'Kidney',
        unit: 'mL/min/1.73 m²',
        decimals: 0,
        accent: 'aqua',
        latestReference: '≥ 60 mL/min/1.73 m²',
    },
]

export function getMetricPoints(metricKey: BloodworkMetricKey) {
    return BLOODWORK_PANELS.flatMap(panel => {
        const value = panel[metricKey]
        return typeof value === 'number' ? [{ date: panel.date, value }] : []
    })
}

export function formatBloodworkValue(metric: BloodworkMetric, value: number): string {
    return value.toFixed(metric.decimals)
}
