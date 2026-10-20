import { seatToastSpots } from '@/utils/seatToastSpots'

// Where each 2 Player seat's unlock toasts go: the half of the screen that's theirs (useSeatSplit's), turned the way they read it.
describe('seatToastSpots', () => {
  const phone = { orientationMode: 'faceToFace' as const, p1OnRight: true }

  it('puts each player at their own end face to face, snake 2 turned across the table', () => {
    expect(seatToastSpots(phone, { orientationMode: 'faceToFace', p1OnRight: true, upsideDown: false })).toEqual({ 1: { rotation: 0, zone: 'bottom' }, 2: { rotation: 180, zone: 'top' } })
    // The halves are fixed, so a portrait upside-down reading turns nothing (see @tastic/core's getFixedZoneRotation).
    expect(seatToastSpots(phone, { orientationMode: 'faceToFace', p1OnRight: true, upsideDown: true })).toEqual({ 1: { rotation: 0, zone: 'bottom' }, 2: { rotation: 180, zone: 'top' } })
  })

  it('keeps players side by side in a landscape hold on their own half, both turned the same quarter', () => {
    expect(seatToastSpots(phone, { orientationMode: 'sideBySide', p1OnRight: true, upsideDown: false })).toEqual({ 1: { rotation: -90, zone: 'bottom' }, 2: { rotation: -90, zone: 'top' } })
    expect(seatToastSpots(phone, { orientationMode: 'sideBySide', p1OnRight: false, upsideDown: false })).toEqual({ 1: { rotation: 90, zone: 'bottom' }, 2: { rotation: 90, zone: 'top' } })
  })

  it("splits a wide browser window left and right, both upright, by the web's p1OnRight", () => {
    // On the web the reading is never turned (getViewRotation's web case), so the angle passed through is 0.
    const web = { orientationMode: 'faceToFace' as const, p1OnRight: false, upsideDown: false }
    expect(seatToastSpots({ orientationMode: 'sideBySide', p1OnRight: false }, web)).toEqual({ 1: { rotation: 0, zone: 'left' }, 2: { rotation: 0, zone: 'right' } })
    expect(seatToastSpots({ orientationMode: 'sideBySide', p1OnRight: true }, web)).toEqual({ 1: { rotation: 0, zone: 'right' }, 2: { rotation: 0, zone: 'left' } })
  })
})
