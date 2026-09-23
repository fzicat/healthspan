import assert from 'node:assert/strict'
import { test } from 'node:test'
import { athleteDate, localDayBounds, validateDate, validateTimezone } from '../src/lib/training-planning/dates'

test('literal calendar dates reject malformed and nonexistent values', () => {
    for (const value of ['2026-2-01', '2026-04-31', '2026-02-29', '2026-09-22T00:00:00Z']) assert.throws(() => validateDate(value), /INVALID_DATE/)
    assert.equal(validateDate('2024-02-29'), '2024-02-29')
})
test('Montreal spring/fall boundaries use 23/25 hours, not fixed-day arithmetic', () => {
    for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25]] as const) {
        const bounds = localDayBounds(date, 'America/Montreal')
        assert.equal((Date.parse(bounds.end) - Date.parse(bounds.start)) / 3600000, hours)
        assert.equal(athleteDate(new Date(bounds.start), 'America/Montreal'), date)
        assert.equal(athleteDate(new Date(Date.parse(bounds.end) - 1), 'America/Montreal'), date)
    }
})
test('explicit non-default IANA zones ignore device/server timezone', () => {
    const instant = new Date('2026-09-22T23:30:00Z')
    assert.equal(athleteDate(instant, 'Asia/Tokyo'), '2026-09-23')
    assert.equal(athleteDate(instant, 'America/Montreal'), '2026-09-22')
    assert.deepEqual(localDayBounds('2026-09-23', 'Asia/Tokyo'), { start: '2026-09-22T15:00:00.000Z', end: '2026-09-23T15:00:00.000Z' })
})
test('invalid timezone and skipped local calendar date are explicit errors', () => {
    assert.throws(() => validateTimezone('Not/A_Zone'), /INVALID_TIMEZONE/)
    assert.throws(() => localDayBounds('2011-12-30', 'Pacific/Apia'), /INVALID_DATE/)
})
