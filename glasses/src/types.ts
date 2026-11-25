// Shared shapes between the glasses app and the server.
export type TicketStatus = 'waiting' | 'going' | 'done';

export interface Ticket {
  id: string;
  seat: string;        // "14" or a table / breakout room name
  name: string;        // student display name
  problem: string;     // short, Claude-shortened when available
  createdAt: number;   // ms epoch
  status: TicketStatus;
  helpedAt?: number;
  doneAt?: number;
}

/** Several students stuck on the same thing: one fix for the whole class. */
export interface Cluster {
  id: string;
  label: string;       // "pip install fails"
  ticketIds: string[];
  fix: string;         // suggested class-wide message
}

export interface QueueState {
  room: string;
  tickets: Ticket[];
  clusters: Cluster[];
  helpedToday: number;
}
