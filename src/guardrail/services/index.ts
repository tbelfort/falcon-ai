/**
 * Service exports for the Pattern Attribution System.
 *
 * Services wrap repositories with business logic and provide
 * clean interfaces for higher-level components.
 */

// Kill switch service
export {
  KillSwitchService,
  PatternCreationState,
  type Scope,
  type AttributionOutcomeInput,
  type KillSwitchStatusResult,
} from './kill-switch.service.js';
