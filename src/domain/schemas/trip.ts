import { z } from 'zod';
import type { ActorRef, FacilityRef } from './common';

/** Last mile: one vehicle run from a store to several schools, each stop with proof of delivery. */
export const TRIP_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
export const STOP_STATUSES = ['PENDING', 'ARRIVED', 'DELIVERED', 'FAILED'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

export const tripCreateSchema = z.object({
  originFacilityId: z.string().min(1, 'Choose where the trip starts'),
  vehicleNo: z.string().trim().toUpperCase().min(6, 'Enter the vehicle number'),
  driverName: z.string().trim().min(2, 'Enter the driver'),
  driverPhone: z.string().trim().min(10, 'Enter the driver’s phone'),
  plannedStartAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  shipmentIds: z.array(z.string()).min(1, 'Add at least one delivery'),
});
export type TripCreateInput = z.infer<typeof tripCreateSchema>;

export const handoverSchema = z.object({
  receivedBy: z.string().trim().min(2, 'Enter who received the goods'),
  receiverRole: z.string().trim().max(60).optional(),
  photoName: z.string().max(200).optional(),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  note: z.string().max(300).optional(),
});
export const stopArriveSchema = z.object({ geo: z.object({ lat: z.number(), lng: z.number() }).optional() });
export const stopFailSchema = z.object({ reason: z.enum(['SCHOOL_CLOSED', 'NO_RECEIVER', 'ROAD_BLOCKED', 'VEHICLE_BREAKDOWN', 'REFUSED', 'OTHER']), note: z.string().max(300).optional() });

export interface ProofOfDelivery { receivedBy: string; receiverRole?: string; signedAt: string; geo?: { lat: number; lng: number }; photoName?: string; grnId?: string; grnNo?: string; hasDiscrepancy?: boolean }
export interface TripStopDto {
  seq: number;
  shipmentId: string;
  shipmentNo: string;
  facility: FacilityRef;
  status: StopStatus;
  eta?: string;
  arrivedAt?: string;
  deliveredAt?: string;
  failure?: { reason: string; note?: string; at: string };
  pod?: ProofOfDelivery;
  lineSummary: string;
}
export interface TripDto {
  id: string;
  tripNo: string;
  origin: FacilityRef;
  vehicleNo: string;
  driverName: string;
  driverPhone: string;
  status: TripStatus;
  plannedStartAt: string;
  startedAt?: string;
  completedAt?: string;
  stops: TripStopDto[];
  progress: { total: number; delivered: number; failed: number };
  createdBy: ActorRef;
  createdAt: string;
}

export interface LastMileBoardDto {
  date: string;
  totals: { stops: number; delivered: number; pending: number; failed: number; trips: number; tripsActive: number; awaitingTrip: number };
  stops: (TripStopDto & { tripId: string; tripNo: string; vehicleNo: string; driverName: string })[];
  awaitingTrip: { shipmentId: string; shipmentNo: string; to: FacilityRef; from: FacilityRef; status: string; expectedArrivalAt: string }[];
}
