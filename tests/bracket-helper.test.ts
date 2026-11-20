import { createBracketPlan, moveFirstRoundTeam, swapFirstRoundTeams } from '../src/utils/bracketHelper';

const teams = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `team-${index + 1}`,
  name: `ทีม ${index + 1}`,
  rank: index + 1
}));

describe('bracket planning', () => {
  it('creates only the final round for two teams', () => {
    const plan = createBracketPlan(teams(2), () => 0);
    expect(plan.rounds).toHaveLength(1);
    expect(plan.rounds[0][0].teamIds.filter(Boolean)).toHaveLength(2);
  });

  it('gives rank one the bye and pairs the remaining odd field', () => {
    const plan = createBracketPlan(teams(5), () => 0);
    expect(plan.byeTeamId).toBe('team-1');
    expect(plan.rounds[0]).toHaveLength(2);
    expect(plan.rounds[0].flatMap(match => match.teamIds)).not.toContain('team-1');
  });

  it('randomly pairs an even field without a bye', () => {
    const plan = createBracketPlan(teams(8), () => 0);
    expect(plan.byeTeamId).toBeNull();
    expect(plan.rounds[0]).toHaveLength(4);
    expect(plan.rounds[0].flatMap(match => match.teamIds).filter(Boolean)).toHaveLength(8);
  });

  it('keeps the only eligible team waiting for an opponent', () => {
    expect(createBracketPlan(teams(1))).toEqual({ rounds: [], byeTeamId: 'team-1' });
  });

  it('swaps teams only between occupied first-round slots', () => {
    const plan = createBracketPlan(teams(4), () => 0);
    const first = plan.rounds[0][0].teamIds[0]!;
    const second = plan.rounds[0][1].teamIds[1]!;
    const swapped = swapFirstRoundTeams(plan, first, second);
    expect(swapped.rounds[0][0].teamIds[0]).toBe(second);
    expect(swapped.rounds[0][1].teamIds[1]).toBe(first);
    expect(swapped.rounds[1]).toEqual(plan.rounds[1]);
  });

  it('moves a team to an empty first-round slot and leaves later rounds intact', () => {
    const plan = createBracketPlan(teams(4), () => 0);
    const sourceTeam = plan.rounds[0][0].teamIds[0]!;
    plan.rounds[0][1].teamIds[1] = null;
    const moved = moveFirstRoundTeam(plan, sourceTeam, 1, 1);
    expect(moved.rounds[0][0].teamIds[0]).toBeNull();
    expect(moved.rounds[0][1].teamIds[1]).toBe(sourceTeam);
    expect(moved.rounds[1]).toEqual(plan.rounds[1]);
  });
});
