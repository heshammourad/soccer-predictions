'use server';

import { revalidatePath } from 'next/cache';
import { SimulatorEngine } from '../lib/simulator/engine';
import { WorldCup48Config } from '../lib/simulator/config/worldCup';
import { NationsLeagueConfig } from '../lib/simulator/config/nationsLeague';
import { AfricaCupQualifiersConfig } from '../lib/simulator/config/africaCupQualifiers';
import { TournamentConfig } from '../lib/simulator/types';

export async function triggerSimulation(tournamentCode: string) {
  try {
    const code = tournamentCode.toUpperCase();
    console.log(`Starting simulation for ${code} via TypeScript engine...`);

    let config: TournamentConfig;
    if (code === 'WC') {
      config = new WorldCup48Config();
    } else if (['ENA', 'ENB', 'ENC'].includes(code)) {
      // Leagues A-C are simulated together (playoffs link them); one run is
      // written per league, so refresh all three pages.
      config = new NationsLeagueConfig();
    } else if (code === 'FQ') {
      config = new AfricaCupQualifiersConfig();
    } else {
      throw new Error(`Simulation configuration not yet implemented for tournament code: ${tournamentCode}`);
    }
    
    const engine = new SimulatorEngine(config, 10000);
    await engine.runSimulation();
    
    // Revalidate the tournament route
    (config.leagues?.map((l) => l.code) ?? [code]).forEach((c) => revalidatePath(`/tournament/${c}`));
    return { success: true };
  } catch (error: any) {
    console.error("Simulation Server Action error:", error);
    return { success: false, error: error.message || 'Failed to run simulation' };
  }
}
