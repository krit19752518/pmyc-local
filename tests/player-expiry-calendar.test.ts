import { bangkokToday, previousCalendarDay } from '../src/services/playerOcr.date';
import { compareVerification } from '../src/services/playerVerification.service';

afterEach(()=>jest.useRealTimers());
it.each([
  ['2026-11-08T16:59:59Z','2026-11-08'],['2026-11-08T17:00:00Z','2026-11-09'],
  ['2026-12-31T17:00:00Z','2027-01-01']
])('uses the Thailand calendar at %s', (instant,day)=>expect(bangkokToday(new Date(instant))).toBe(day));
it.each([
  ['2026-01-01','2025-12-31'],['2026-11-01','2026-10-31'],['2024-03-01','2024-02-29'],['2025-03-01','2025-02-28']
])('calculates yesterday across the boundary %s', (today,expected)=>expect(previousCalendarDay(today)).toBe(expected));
it('rechecks a previously valid cached expiry after midnight in Thailand',()=>{
  const cached={provider:'iapp',documentType:'id_card',fields:{expiryDate:{value:'8 พ.ย. 2569',validation:'VALID',confidence:null}}};
  jest.useFakeTimers().setSystemTime(new Date('2026-11-08T16:59:59Z'));
  expect(compareVerification({},cached)[3]).toMatchObject({suggestedDecision:'SYSTEM_CORRECT',expired:false});
  jest.setSystemTime(new Date('2026-11-08T17:00:00Z'));
  expect(compareVerification({},cached)[3]).toMatchObject({suggestedDecision:'EXPIRED_CARD',expired:true,comparisonDate:'2026-11-09'});
});
