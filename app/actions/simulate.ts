'use server';

import { revalidatePath } from 'next/cache';
import { SimulatorEngine } from '../lib/simulator/engine';
import { WorldCup48Config } from '../lib/simulator/config/worldCup';

export async function triggerSimulation() {
  try {
    console.log("Starting World Cup 2026 simulation via TypeScript engine...");
    
    const config = new WorldCup48Config();
    const engine = new SimulatorEngine(config, 10000);
    
    await engine.runSimulation();
    
    // Revalidate index page so the new projections load
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error("Simulation Server Action error:", error);
    return { success: false, error: error.message || 'Failed to run simulation' };
  }
}
