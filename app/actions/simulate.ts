'use server';

import { revalidatePath } from 'next/cache';
import { SimulatorEngine } from '../lib/simulator/engine';
import { WorldCup48Config } from '../lib/simulator/config/worldCup';

export async function triggerSimulation(tournamentCode: string) {
  try {
    const code = tournamentCode.toUpperCase();
    console.log(`Starting simulation for ${code} via TypeScript engine...`);
    
    let config;
    if (code === 'WC') {
      config = new WorldCup48Config();
    } else {
      throw new Error(`Simulation configuration not yet implemented for tournament code: ${tournamentCode}`);
    }
    
    const engine = new SimulatorEngine(config, 10000);
    await engine.runSimulation();
    
    // Revalidate the tournament route
    revalidatePath(`/tournament/${tournamentCode}`);
    return { success: true };
  } catch (error: any) {
    console.error("Simulation Server Action error:", error);
    return { success: false, error: error.message || 'Failed to run simulation' };
  }
}
