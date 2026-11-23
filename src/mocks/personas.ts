import type { Role } from '@nt/domain';

export interface Persona {
  id: string;
  tenant: string;
  username: string;
  name: string;
  role: Role;
  scope: 'state' | 'district' | 'block' | 'school' | 'district-warehouse' | 'state-warehouse';
  /** What to show in the pitch: why this person matters. */
  story: string;
}

export const PERSONAS: Persona[] = [
  { id: 'tn-state', tenant: 'TN', username: 'state.admin', name: 'Dr. Aruna Krishnan', role: 'STATE_ADMIN', scope: 'state', story: 'Sees the whole state: children fed, deliveries, recalls, and which districts need attention.' },
  { id: 'tn-dadmin', tenant: 'TN', username: 'admin.madurai', name: 'V. Anand', role: 'DISTRICT_ADMIN', scope: 'district', story: 'Madurai district data administrator. Works only in the Admin Console: onboards schools and staff for the district.' },
  { id: 'tn-district', tenant: 'TN', username: 'do.madurai', name: 'S. Karthikeyan', role: 'DISTRICT_OFFICER', scope: 'district', story: 'Madurai district. Approves stock write-offs and follows up exceptions in his district only.' },
  { id: 'tn-block', tenant: 'TN', username: 'bc.melur', name: 'R. Vasantha', role: 'BLOCK_COORDINATOR', scope: 'block', story: 'Melur block. Chases schools that have not reported and closes local issues.' },
  { id: 'tn-head', tenant: 'TN', username: 'hm.kottampatti', name: 'P. Selvi', role: 'SCHOOL_HEAD', scope: 'school', story: 'Headmaster of one school. Receives today’s delivery, records cooking and reports meals — works offline.' },
  { id: 'tn-wh', tenant: 'TN', username: 'wh.madurai', name: 'M. Babu', role: 'WAREHOUSE_OPERATOR', scope: 'district-warehouse', story: 'Madurai District Warehouse. Plans FEFO shipments, receives stock, raises adjustments.' },
  { id: 'tn-driver', tenant: 'TN', username: 'driver.madurai', name: 'Raja (driver)', role: 'TRANSPORT_COORDINATOR', scope: 'district', story: 'Delivery driver for Madurai. Uses the run sheet on a phone: start the trip, arrive, hand over at each school.' },
  { id: 'tn-proc', tenant: 'TN', username: 'procurement', name: 'L. Ramesh', role: 'PROCUREMENT_OFFICER', scope: 'state', story: 'Raises purchase orders and records supplier dispatches — where every lot is born.' },
  { id: 'tn-qc', tenant: 'TN', username: 'quality', name: 'Dr. N. Farida', role: 'QUALITY_INSPECTOR', scope: 'state', story: 'Records inspections, holds and releases lots, and runs recalls.' },
  { id: 'tn-nutri', tenant: 'TN', username: 'nutrition', name: 'Dr. G. Padmini', role: 'NUTRITIONIST', scope: 'state', story: 'Owns recipes and checks them against nutrition norms.' },
  { id: 'tn-audit', tenant: 'TN', username: 'auditor', name: 'K. Natarajan (AG office)', role: 'AUDITOR', scope: 'state', story: 'Read-only. Verifies the ledger and reviews the audit trail.' },
  { id: 'tn-super', tenant: 'TN', username: 'statwig', name: 'StaTwig Support', role: 'SUPER_ADMIN', scope: 'state', story: 'Platform administrator for onboarding and configuration.' },
  { id: 'ka-state', tenant: 'KA', username: 'ka.admin', name: 'Smt. Shobha Rao', role: 'STATE_ADMIN', scope: 'state', story: 'Karnataka: District › Taluk hierarchy, Kannada interface, milk programme.' },
  { id: 'up-state', tenant: 'UP', username: 'up.admin', name: 'Shri Alok Mishra', role: 'STATE_ADMIN', scope: 'state', story: 'Uttar Pradesh: Division › District › Block hierarchy, Hindi interface.' },
];

export const DEMO_PASSWORD = 'demo-pitch-2026';
