export interface BracketTeam {
  id: string;
  name: string;
  rank: number;
}

export interface BracketMatch {
  id: string;
  round: number;
  slot: number;
  teamIds: [string | null, string | null];
}

export interface BracketPlan {
  rounds: BracketMatch[][];
  byeTeamId: string | null;
}

/** Build a single-elimination plan. An odd field gives rank 1 a first-round bye. */
export function createBracketPlan(
  eligibleTeams: BracketTeam[],
  random: () => number = Math.random
): BracketPlan {
  if (eligibleTeams.length < 2) return { rounds: [], byeTeamId: eligibleTeams[0]?.id || null };

  const teams = [...eligibleTeams];
  const byeTeam = teams.length % 2 === 1 ? teams.find(team => team.rank === 1) : undefined;
  const playingTeams = teams.filter(team => team.id !== byeTeam?.id);

  for (let i = playingTeams.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [playingTeams[i], playingTeams[j]] = [playingTeams[j], playingTeams[i]];
  }

  const firstRound: BracketMatch[] = [];
  for (let i = 0; i < playingTeams.length; i += 2) {
    firstRound.push({
      id: `r1-m${firstRound.length + 1}`,
      round: 1,
      slot: firstRound.length,
      teamIds: [playingTeams[i]?.id || null, playingTeams[i + 1]?.id || null]
    });
  }

  if (teams.length === 2) return { rounds: [firstRound], byeTeamId: null };

  const rounds: BracketMatch[][] = [firstRound];
  let matchCount = Math.ceil((firstRound.length + (byeTeam ? 1 : 0)) / 2);
  let round = 2;
  while (matchCount >= 1) {
    rounds.push(Array.from({ length: matchCount }, (_, slot) => ({
      id: `r${round}-m${slot + 1}`,
      round,
      slot,
      teamIds: [null, null] as [string | null, string | null]
    })));
    if (matchCount === 1) break;
    matchCount = Math.ceil(matchCount / 2);
    round += 1;
  }

  return { rounds, byeTeamId: byeTeam?.id || null };
}

export function swapFirstRoundTeams(plan: BracketPlan, sourceTeamId: string, targetTeamId: string): BracketPlan {
  const firstRound = plan.rounds[0];
  if (!firstRound) return plan;
  const positions: Array<{ matchIndex: number; side: 0 | 1 }> = [];
  firstRound.forEach((match, matchIndex) => match.teamIds.forEach((id, side) => {
    if (id === sourceTeamId || id === targetTeamId) positions.push({ matchIndex, side: side as 0 | 1 });
  }));
  if (positions.length !== 2) return plan;
  const updated = { ...plan, rounds: plan.rounds.map(roundMatches => roundMatches.map(match => ({ ...match, teamIds: [...match.teamIds] as [string | null, string | null] }))) };
  const first = updated.rounds[0][positions[0].matchIndex].teamIds;
  const second = updated.rounds[0][positions[1].matchIndex].teamIds;
  [first[positions[0].side], second[positions[1].side]] = [second[positions[1].side], first[positions[0].side]];
  return updated;
}

export function moveFirstRoundTeam(plan: BracketPlan, sourceTeamId: string, targetMatchIndex: number, targetSide: 0 | 1): BracketPlan {
  const firstRound = plan.rounds[0];
  if (!firstRound || !sourceTeamId || !firstRound[targetMatchIndex]) return plan;
  let sourcePosition: { matchIndex: number; side: 0 | 1 } | undefined;
  firstRound.forEach((match, matchIndex) => match.teamIds.forEach((id, side) => {
    if (id === sourceTeamId) sourcePosition = { matchIndex, side: side as 0 | 1 };
  }));
  if (!sourcePosition) return plan;
  const updated = { ...plan, rounds: plan.rounds.map(roundMatches => roundMatches.map(match => ({ ...match, teamIds: [...match.teamIds] as [string | null, string | null] }))) };
  const source = updated.rounds[0][sourcePosition.matchIndex].teamIds;
  const target = updated.rounds[0][targetMatchIndex].teamIds;
  if (sourcePosition.matchIndex === targetMatchIndex && sourcePosition.side === targetSide) return plan;
  if (target[targetSide] !== null) [source[sourcePosition.side], target[targetSide]] = [target[targetSide], source[sourcePosition.side]];
  else {
    target[targetSide] = source[sourcePosition.side];
    source[sourcePosition.side] = null;
  }
  return updated;
}
