import { resetBoundKey,resetGeneration } from '../src/services/playerVerification.reset';
it('retains shared cache keys until a player-specific reset and isolates every new round',()=>{
  const base='a'.repeat(64);expect(resetBoundKey(base,null)).toBe(base);
  expect(resetBoundKey(base,'reset-a')).not.toBe(base);expect(resetBoundKey(base,'reset-a')).not.toBe(resetBoundKey(base,'reset-b'));
  expect(resetBoundKey(base,'reset-a')).toBe(resetBoundKey(base,'reset-a'));
});
it('looks up only the scoped reset marker',async()=>{
  const query=jest.fn().mockResolvedValue({rows:[{id:'reset-a'}]});expect(await resetGeneration('PLAYER-A',{query})).toBe('reset-a');
  expect(query.mock.calls[0][1]).toEqual(['PLAYER-A']);expect(query.mock.calls[0][0]).toContain("error_code='REVIEW_RESET'");
});
